import { OPERATIONS } from './operations.js';

/** Interprets the graph for the given roots; `env` maps variable and parameter names to numbers. */
export function evaluateGraph(graph, roots, env) {
  const values = new Map();
  for (const id of graph.reachable(roots)) {
    const node = graph.node(id);
    switch (node.op) {
      case 'const':
        values.set(id, node.value);
        break;
      case 'var':
      case 'param': {
        const value = env[node.name];
        if (typeof value !== 'number') throw new TypeError(`missing numeric value for '${node.name}'`);
        values.set(id, value);
        break;
      }
      default:
        values.set(id, OPERATIONS[node.op].evaluate(...node.args.map((arg) => values.get(arg))));
    }
  }
  return roots.map((root) => values.get(root));
}
