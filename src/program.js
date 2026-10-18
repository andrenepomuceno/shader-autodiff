import { ExpressionError } from './errors.js';
import { Graph } from './graph.js';
import { CONSTANTS, FUNCTIONS } from './operations.js';
import { DEFAULT_LIMITS, parse } from './parser.js';
import { checkIdentifier } from './names.js';
import { Differentiator } from './differentiate.js';
import { evaluateGraph } from './evaluate.js';
import { emitFunction, shapeValues } from './targets.js';
import { buildTsl, packTsl } from './tsl.js';

function checkNames({ variables, parameters, derived }) {
  const seen = new Set();
  for (const name of [...variables, ...parameters, ...Object.keys(derived)]) {
    checkIdentifier(name);
    if (seen.has(name)) throw new TypeError(`symbol '${name}' is declared twice`);
    seen.add(name);
  }
}

/**
 * A program is one SSA graph shared by any number of expressions and their derivatives. Expressions
 * are opaque node handles (integers) that can be combined arithmetically, differentiated to any
 * order, evaluated in JS, and emitted together as one GLSL, WGSL or JS function.
 */
export function createProgram({ variables = [], parameters = [], derived = {}, limits = {} } = {}) {
  checkNames({ variables, parameters, derived });
  const allLimits = { ...DEFAULT_LIMITS, ...limits };
  const graph = new Graph();
  const differentiator = new Differentiator(graph);
  const symbols = new Map();
  variables.forEach((name, index) => symbols.set(name, graph.variable(name, index)));
  parameters.forEach((name) => symbols.set(name, graph.parameter(name)));
  for (const [name, value] of Object.entries(CONSTANTS)) symbols.set(name, graph.constant(value));

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
    resolving.add(node.name);
    try {
      const id = lower(parse(derived[node.name], { source: derivedSource, limits: allLimits }), derivedSource);
      symbols.set(node.name, id);
      return id;
    } finally {
      resolving.delete(node.name);
    }
  }

  function power(base, exponent, exponentNode, source) {
    const value = graph.constantValue(exponent);
    if (value === undefined) {
      return graph.isConstant(base, Math.E) ? graph.apply('exp', [exponent]) : graph.apply('pow', [base, exponent]);
    }
    if (Math.abs(value) > allLimits.maxExponent) {
      throw new ExpressionError(`exponent ${value} exceeds ${allLimits.maxExponent}`, { start: exponentNode.start, end: exponentNode.end, source });
    }
    if (Number.isInteger(value)) return graph.integerPower(base, value);
    if (value === 0.5) return graph.apply('sqrt', [base]);
    if (value === -0.5) return graph.div(graph.constant(1), graph.apply('sqrt', [base]));
    return graph.apply('pow', [base, exponent]);
  }

  function call(node, args, source) {
    switch (node.name) {
      case 'pow':
        return power(args[0], args[1], node.args[1], source);
      case 'mod': {
        const [a, b] = args;
        return graph.sub(a, graph.mul(b, graph.apply('floor', [graph.div(a, b)])));
      }
      case 'fract':
        return graph.sub(args[0], graph.apply('floor', args));
      case 'exp2':
        return graph.apply('pow', [graph.constant(2), args[0]]);
      case 'log2':
        return graph.div(graph.apply('log', args), graph.constant(Math.LN2));
      case 'clamp': {
        const [x, low, high] = args;
        return graph.apply('min', [graph.apply('max', [x, low]), high]);
      }
      case 'mix': {
        const [a, b, t] = args;
        return graph.add(a, graph.mul(graph.sub(b, a), t));
      }
      case 'step': {
        const [edge, x] = args;
        return graph.apply('select', [x, edge, graph.constant(0), graph.constant(1)]);
      }
      // t = clamp((x − e0) / (e1 − e0), 0, 1); t²·(3 − 2t)
      case 'smoothstep': {
        const [edge0, edge1, x] = args;
        const ratio = graph.div(graph.sub(x, edge0), graph.sub(edge1, edge0));
        const t = graph.apply('min', [graph.apply('max', [ratio, graph.constant(0)]), graph.constant(1)]);
        return graph.mul(graph.mul(t, t), graph.sub(graph.constant(3), graph.mul(graph.constant(2), t)));
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
          return node.op === 'pow' ? power(left, right, node.right, source) : graph.apply(node.op, [left, right]);
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

  function handle(id) {
    if (!Number.isInteger(id) || id < 0 || id >= graph.nodes.length) throw new TypeError(`invalid expression handle ${id}`);
    return id;
  }

  function variableNode(name) {
    const index = context.variables.indexOf(name);
    if (index < 0) throw new TypeError(`'${name}' is not a variable`);
    return symbols.get(name);
  }

  function arithmetic(op) {
    return (...args) => {
      try {
        return graph.apply(op, args.map(handle));
      } catch (error) {
        if (error instanceof RangeError) throw new ExpressionError(`${error.message} (constant folding)`);
        throw error;
      }
    };
  }

  const context = { graph, variables: Object.freeze([...variables]), parameters: Object.freeze([...parameters]) };

  return {
    variables: context.variables,
    parameters: context.parameters,
    /** Parses and lowers `text`; `source` labels errors. */
    expression: (text, source = 'expression') => lower(parse(text, { source, limits: allLimits }), source),
    constant: (value) => graph.constant(value),
    add: arithmetic('add'),
    sub: arithmetic('sub'),
    mul: arithmetic('mul'),
    div: arithmetic('div'),
    neg: arithmetic('neg'),
    /** ∂expression/∂variable, itself an expression that can be differentiated again. */
    derivative: (expression, variable) =>
      differentiator.tangent(handle(expression), variableNode(variable)) ?? graph.constant(0),
    isZero: (expression) => graph.isConstant(handle(expression), 0),
    evaluate: (expressions, env) => evaluateGraph(graph, expressions.map(handle), env),
    /** Evaluates the outputs of a function spec, shaped as the emitted JS would return them. */
    evaluateFunction(spec, env) {
      const outputs = [...(spec.returns ? [{ ...spec.returns, name: 'value' }] : []), ...(spec.outputs ?? [])];
      const values = evaluateGraph(graph, outputs.flatMap((output) => output.components.map(handle)), env);
      const result = {};
      for (const output of outputs) result[output.name] = shapeValues(output, values.splice(0, output.components.length));
      return result;
    },
    /**
     * three.js TSL nodes for the outputs of a function spec, shaped like `evaluateFunction`
     * (`float` → node, `vecN`/`matN` → TSL vector/matrix node, other types → arrays of nodes).
     * `inputs` is a vector node for 2–4 variables, or an array or object of scalar nodes;
     * `parameters` maps parameter names to TSL nodes (uniforms).
     */
    tsl(spec, TSL, { inputs, parameters: parameterNodes } = {}) {
      const outputs = [...(spec.returns ? [{ ...spec.returns, name: 'value' }] : []), ...(spec.outputs ?? [])];
      const nodes = buildTsl(graph, outputs.flatMap((output) => output.components.map(handle)), TSL, {
        variables: context.variables,
        inputs,
        parameters: parameterNodes,
      });
      const result = {};
      for (const output of outputs) {
        const components = nodes.splice(0, output.components.length);
        result[output.name] = output.shape?.length === 2 && !/^mat[234]$/.test(output.type)
          ? shapeValues(output, components)
          : packTsl(TSL, output.type, components);
      }
      return result;
    },
    glsl: (spec) => emitFunction('glsl', context, spec),
    wgsl: (spec) => emitFunction('wgsl', context, spec),
    js: (spec) => emitFunction('js', context, spec),
  };
}
