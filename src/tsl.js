import { checkFloat32 } from './targets.js';

const COMPONENTS = ['x', 'y', 'z', 'w'];
const DIRECT = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'floor', 'min', 'max', 'pow']);
const OPERATORS = { add: 'add', sub: 'sub', mul: 'mul', div: 'div' };

function isPlainObject(value) {
  const prototype = value === null || typeof value !== 'object' ? undefined : Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Reads variable `index` from the caller's inputs: an array, a plain object by name, or a TSL node
 * (the node itself for one variable, its x/y/z/w components for 2–4).
 */
function variableNode(inputs, name, index, count) {
  if (inputs === undefined || inputs === null) return undefined;
  if (Array.isArray(inputs)) return inputs[index];
  if (isPlainObject(inputs)) return Object.hasOwn(inputs, name) ? inputs[name] : undefined;
  if (count === 1) return inputs;
  if (count >= 2 && count <= 4) return inputs[COMPONENTS[index]];
  return undefined;
}

/**
 * Builds three.js TSL nodes for `roots` by calling the TSL namespace the caller passes in
 * (`import * as TSL from 'three/tsl'`), so this library never imports three. Each graph node maps
 * to exactly one TSL node object, and reusing the object lets TSL share it in the generated shader.
 */
export function buildTsl(graph, roots, TSL, { variables, inputs, parameters = {} }) {
  const nodes = new Map();
  const half = () => TSL.float(0.5);
  for (const id of graph.reachable(roots)) {
    const node = graph.node(id);
    const args = node.args.map((arg) => nodes.get(arg));
    let result;
    switch (node.op) {
      case 'const':
        result = TSL.float(checkFloat32(node.value));
        break;
      case 'var':
        result = variableNode(inputs, node.name, node.index, variables.length);
        if (result === undefined) throw new TypeError(`no TSL input for variable '${node.name}'`);
        break;
      case 'param':
        if (!Object.hasOwn(parameters, node.name)) throw new TypeError(`no TSL node for parameter '${node.name}'`);
        result = parameters[node.name];
        break;
      case 'neg':
        result = TSL.negate(args[0]);
        break;
      case 'atan2':
        result = TSL.atan(args[0], args[1]);
        break;
      case 'select':
        result = TSL.select(TSL.lessThan(args[0], args[1]), args[2], args[3]);
        break;
      // TSL has no hyperbolic functions; these are the textbook forms (tanh avoids exp overflow).
      case 'sinh':
        result = TSL.mul(TSL.sub(TSL.exp(args[0]), TSL.exp(TSL.negate(args[0]))), half());
        break;
      case 'cosh':
        result = TSL.mul(TSL.add(TSL.exp(args[0]), TSL.exp(TSL.negate(args[0]))), half());
        break;
      case 'tanh':
        result = TSL.sub(TSL.float(1), TSL.div(TSL.float(2), TSL.add(TSL.exp(TSL.mul(TSL.float(2), args[0])), TSL.float(1))));
        break;
      default:
        if (Object.hasOwn(OPERATORS, node.op)) result = TSL[OPERATORS[node.op]](args[0], args[1]);
        else if (DIRECT.has(node.op)) result = TSL[node.op](...args);
        else throw new Error(`no TSL mapping for '${node.op}'`);
    }
    nodes.set(id, result);
  }
  return roots.map((root) => nodes.get(root));
}

/** Packs TSL scalar nodes into one TSL node of a shader type: float, vecN or matN (column-major). */
export function packTsl(TSL, type, components) {
  return type === 'float' ? components[0] : TSL[type](...components);
}
