const COMPONENTS = ['x', 'y', 'z', 'w'];
const DIRECT = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'floor', 'min', 'max', 'pow']);
const OPERATORS = { add: 'add', sub: 'sub', mul: 'mul', div: 'div' };

/** Reads variable `index` from the caller's inputs: a TSL vector node, an array, or an object by name. */
function variableNode(inputs, name, index, count) {
  if (Array.isArray(inputs)) return inputs[index];
  if (inputs && Object.hasOwn(inputs, name)) return inputs[name];
  if (inputs && count >= 2 && count <= 4) return inputs[COMPONENTS[index]];
  if (inputs && count === 1) return inputs;
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
        result = TSL.float(node.value);
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

/** Packs TSL scalar nodes into the TSL value for a shader type (float, vecN, matN, else an array). */
export function packTsl(TSL, type, components) {
  if (type === 'float') return components[0];
  const vector = /^vec([234])$/.exec(type);
  if (vector) return TSL[`vec${vector[1]}`](...components);
  const matrix = /^mat([234])$/.exec(type);
  if (matrix) return TSL[`mat${matrix[1]}`](...components);
  return components;
}
