import { OPERATIONS } from './operations.js';

/**
 * Forward mode at codegen time: the tangent of `root` with respect to the variable node `variable`,
 * built as new graph nodes so it shares subexpressions with the value. Returns null when the
 * derivative is identically zero.
 */
export function tangent(graph, root, variable) {
  const tangents = new Map();
  for (const id of graph.reachable([root])) {
    const node = graph.node(id);
    if (node.op === 'const' || node.op === 'param' || node.op === 'var') {
      tangents.set(id, id === variable ? graph.constant(1) : null);
      continue;
    }
    const argumentTangents = node.args.map((arg) => tangents.get(arg));
    const result = argumentTangents.every((value) => value === null)
      ? null
      : OPERATIONS[node.op].tangent(graph, node.args, id, argumentTangents);
    tangents.set(id, result);
  }
  return tangents.get(root);
}

export function gradient(graph, root, variables) {
  return variables.map((variable) => tangent(graph, root, variable));
}
