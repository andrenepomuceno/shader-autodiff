import { OPERATIONS } from './operations.js';

/**
 * Forward mode at codegen time. Tangents are built as new graph nodes, so they share
 * subexpressions with the value and can be differentiated again. A `null` tangent is identically
 * zero and is never built. Tangents are cached per variable; the graph only grows, so they stay valid.
 */
export class Differentiator {
  constructor(graph) {
    this.graph = graph;
    this.caches = new Map();
  }

  tangent(root, variable) {
    const { graph } = this;
    if (!this.caches.has(variable)) this.caches.set(variable, new Map());
    const tangents = this.caches.get(variable);
    for (const id of graph.reachable([root])) {
      if (tangents.has(id)) continue;
      const node = graph.node(id);
      if (node.op === 'const' || node.op === 'param' || node.op === 'var') {
        tangents.set(id, id === variable ? graph.constant(1) : null);
        continue;
      }
      const argumentTangents = node.args.map((arg) => tangents.get(arg));
      tangents.set(id, argumentTangents.every((value) => value === null)
        ? null
        : OPERATIONS[node.op].tangent(graph, node.args, id, argumentTangents));
    }
    return tangents.get(root);
  }
}
