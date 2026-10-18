const ATOM = 100;
const UNARY = 90;
const PRODUCT = 80;
const SUM = 70;

const BINARY = { add: ['+', SUM], sub: ['-', SUM], mul: ['*', PRODUCT], div: ['/', PRODUCT] };

const LEAVES = new Set(['const', 'var', 'param']);

/**
 * Lowers the graph reachable from `roots` to straight-line code. Nodes used more than once become
 * temporaries t0, t1, … in topological order; everything else is inlined. Operands are parenthesised
 * whenever the evaluation order would otherwise change, so every target evaluates the same DAG.
 *
 * `target` supplies `literal(value)`, `symbol(node)`, `call(op, args)` and `select(a, b, c, d)`,
 * which renders `a < b ? c : d` as an atom.
 */
export function lower(graph, roots, target) {
  const order = graph.reachable(roots);
  const uses = new Map();
  for (const id of [...roots, ...order.flatMap((id) => graph.node(id).args)]) {
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  const rendered = new Map();
  const temporaries = [];
  const wrap = ([text, precedence], minimum) => (precedence >= minimum ? text : `(${text})`);

  function render(id) {
    const node = graph.node(id);
    switch (node.op) {
      case 'const': {
        const text = target.literal(node.value);
        return [text, node.value < 0 ? UNARY : ATOM];
      }
      case 'var':
      case 'param':
        return [target.symbol(node), ATOM];
      case 'neg':
        return [`-${wrap(rendered.get(node.args[0]), UNARY + 1)}`, UNARY];
      case 'select': {
        return [target.select(...node.args.map((arg) => rendered.get(arg)[0])), ATOM];
      }
      default: {
        if (node.op in BINARY) {
          const [symbol, precedence] = BINARY[node.op];
          const [left, right] = node.args.map((arg) => rendered.get(arg));
          return [`${wrap(left, precedence)} ${symbol} ${wrap(right, precedence + 1)}`, precedence];
        }
        return [target.call(node.op, node.args.map((arg) => rendered.get(arg)[0])), ATOM];
      }
    }
  }

  for (const id of order) {
    const expression = render(id);
    if (!LEAVES.has(graph.node(id).op) && uses.get(id) > 1) {
      const name = `t${temporaries.length}`;
      temporaries.push([name, expression[0]]);
      rendered.set(id, [name, ATOM]);
    } else {
      rendered.set(id, expression);
    }
  }
  return { temporaries, expressions: roots.map((root) => rendered.get(root)[0]) };
}
