import { ExpressionError } from './errors.js';
import { Graph } from './graph.js';
import { CONSTANTS, FUNCTIONS } from './operations.js';
import { DEFAULT_LIMITS, parse } from './parser.js';
import { isReserved } from './reserved.js';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function checkNames({ variables, parameters, derived }) {
  const seen = new Set();
  for (const name of [...variables, ...parameters, ...Object.keys(derived)]) {
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) throw new TypeError(`invalid symbol name '${name}'`);
    if (Object.hasOwn(FUNCTIONS, name) || Object.hasOwn(CONSTANTS, name)) throw new TypeError(`symbol '${name}' shadows a built-in`);
    if (isReserved(name)) throw new TypeError(`symbol '${name}' is reserved in the emitted code`);
    if (seen.has(name)) throw new TypeError(`symbol '${name}' is declared twice`);
    seen.add(name);
  }
}

/**
 * Builds the SSA graph of an expression. Returns { graph, root, variables, parameters }, where
 * `variables` holds the variable node ids in declaration order.
 */
export function build(text, { variables = [], parameters = [], derived = {}, limits = {} } = {}) {
  checkNames({ variables, parameters, derived });
  const allLimits = { ...DEFAULT_LIMITS, ...limits };
  const graph = new Graph();
  const symbols = new Map();
  variables.forEach((name, index) => symbols.set(name, graph.variable(name, index)));
  parameters.forEach((name) => symbols.set(name, graph.parameter(name)));
  for (const [name, value] of Object.entries(CONSTANTS)) symbols.set(name, graph.constant(value));

  const derivedTrees = new Map();
  const resolving = new Set();

  function resolve(node, source) {
    if (symbols.has(node.name)) return symbols.get(node.name);
    if (!Object.hasOwn(derived, node.name)) {
      const message = Object.hasOwn(FUNCTIONS, node.name) ? `'${node.name}' is a function` : `unknown symbol '${node.name}'`;
      throw new ExpressionError(message, { start: node.start, end: node.end, source });
    }
    if (resolving.has(node.name)) {
      throw new ExpressionError(`derived symbol '${node.name}' refers to itself`, { start: node.start, end: node.end, source });
    }
    const derivedSource = `derived.${node.name}`;
    if (!derivedTrees.has(node.name)) {
      derivedTrees.set(node.name, parse(derived[node.name], { source: derivedSource, limits: allLimits }));
    }
    resolving.add(node.name);
    const id = lower(derivedTrees.get(node.name), derivedSource);
    resolving.delete(node.name);
    symbols.set(node.name, id);
    return id;
  }

  function power(base, exponent, node, source) {
    const value = graph.constantValue(exponent);
    if (value === undefined) {
      return graph.isConstant(base, Math.E) ? graph.apply('exp', [exponent]) : graph.apply('pow', [base, exponent]);
    }
    if (Math.abs(value) > allLimits.maxExponent) {
      throw new ExpressionError(`exponent ${value} exceeds ${allLimits.maxExponent}`, { start: node.right.start, end: node.right.end, source });
    }
    if (Number.isInteger(value)) return graph.integerPower(base, value);
    if (value === 0.5) return graph.apply('sqrt', [base]);
    if (value === -0.5) return graph.div(graph.constant(1), graph.apply('sqrt', [base]));
    return graph.apply('pow', [base, exponent]);
  }

  function call(node, args, source) {
    switch (node.name) {
      case 'pow':
        return power(args[0], args[1], { right: node.args[1] }, source);
      case 'mod': {
        const [a, b] = args;
        return graph.sub(a, graph.mul(b, graph.apply('floor', [graph.div(a, b)])));
      }
      default:
        return graph.apply(node.name, args);
    }
  }

  function lower(node, source) {
    try {
      switch (node.type) {
        case 'number':
          return graph.constant(node.value);
        case 'name':
          return resolve(node, source);
        case 'unary':
          return graph.neg(lower(node.arg, source));
        case 'binary': {
          const left = lower(node.left, source);
          const right = lower(node.right, source);
          return node.op === 'pow' ? power(left, right, node, source) : graph.apply(node.op, [left, right]);
        }
        case 'call': {
          if (!Object.hasOwn(FUNCTIONS, node.name)) {
            throw new ExpressionError(`unknown function '${node.name}'`, { start: node.start, end: node.start + node.name.length, source });
          }
          const arity = FUNCTIONS[node.name];
          if (node.args.length !== arity) {
            throw new ExpressionError(`'${node.name}' takes ${arity} argument${arity === 1 ? '' : 's'}, got ${node.args.length}`, { start: node.start, end: node.end, source });
          }
          return call(node, node.args.map((arg) => lower(arg, source)), source);
        }
      }
    } catch (error) {
      if (error instanceof RangeError) {
        throw new ExpressionError(`${error.message} (constant folding)`, { start: node.start, end: node.end, source });
      }
      throw error;
    }
  }

  const root = lower(parse(text, { limits: allLimits }), 'expression');
  return { graph, root, variables: variables.map((name) => symbols.get(name)), parameters };
}
