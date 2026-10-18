import { OPERATIONS } from './operations.js';

const COMMUTATIVE = new Set(['add', 'mul', 'min', 'max']);

/**
 * An SSA DAG. Nodes are hash-consed, so structurally equal subexpressions share one id, and ids
 * are assigned in creation order, which is always a topological order.
 */
export class Graph {
  constructor() {
    this.nodes = [];
    this.index = new Map();
  }

  intern(fields) {
    const key = fields.op === 'const'
      ? `const:${fields.value}`
      : `${fields.op}:${fields.name ?? ''}:${(fields.args ?? []).join(',')}`;
    let id = this.index.get(key);
    if (id === undefined) {
      id = this.nodes.length;
      this.nodes.push({ id, args: [], ...fields });
      this.index.set(key, id);
    }
    return id;
  }

  node(id) {
    return this.nodes[id];
  }

  constantValue(id) {
    const node = this.nodes[id];
    return node.op === 'const' ? node.value : undefined;
  }

  isConstant(id, value) {
    return this.constantValue(id) === value;
  }

  constant(value) {
    if (!Number.isFinite(value)) throw new RangeError(`constant evaluates to ${value}`);
    return this.intern({ op: 'const', value: value + 0 });
  }

  variable(name, index) {
    return this.intern({ op: 'var', name, index });
  }

  parameter(name) {
    return this.intern({ op: 'param', name });
  }

  apply(op, args) {
    const values = args.map((arg) => this.constantValue(arg));
    if (values.every((value) => value !== undefined)) {
      return this.constant(OPERATIONS[op].evaluate(...values));
    }
    const ordered = COMMUTATIVE.has(op) ? [...args].sort((a, b) => this.rank(a) - this.rank(b)) : args;
    const simplified = this.simplify(op, ordered);
    if (simplified !== undefined) return simplified;
    return this.intern({ op, args: ordered });
  }

  /** Commutative operands are ordered constants first, then by id. */
  rank(id) {
    return this.nodes[id].op === 'const' ? -1 : id;
  }

  simplify(op, [a, b]) {
    const nodeA = this.nodes[a];
    const nodeB = b === undefined ? undefined : this.nodes[b];
    switch (op) {
      case 'add':
        if (this.isConstant(a, 0)) return b;
        if (this.isConstant(b, 0)) return a;
        if (a === b) return this.mul(this.constant(2), a);
        if (this.constantValue(a) < 0) return this.sub(b, this.constant(-nodeA.value));
        for (const [term, other] of [[b, a], [a, b]]) {
          const [factor, rest] = this.scaled(term);
          if (factor < 0) return this.sub(other, this.mul(this.constant(-factor), rest));
        }
        if (nodeB.op === 'neg') return this.sub(a, nodeB.args[0]);
        if (nodeA.op === 'neg') return this.sub(b, nodeA.args[0]);
        return undefined;
      case 'sub':
        if (this.isConstant(b, 0)) return a;
        if (this.isConstant(a, 0)) return this.neg(b);
        if (a === b) return this.constant(0);
        if (nodeB.op === 'neg') return this.add(a, nodeB.args[0]);
        if (this.constantValue(b) < 0) return this.add(a, this.constant(-nodeB.value));
        if (this.scaled(b)[0] < 0) return this.add(a, this.mul(this.constant(-this.scaled(b)[0]), this.scaled(b)[1]));
        return undefined;
      case 'mul':
        if (this.isConstant(a, 0) || this.isConstant(b, 0)) return this.constant(0);
        if (this.isConstant(a, 1)) return b;
        if (this.isConstant(b, 1)) return a;
        if (this.isConstant(a, -1)) return this.neg(b);
        if (this.isConstant(b, -1)) return this.neg(a);
        if (nodeA.op === 'const' && nodeB.op === 'mul' && this.constantValue(nodeB.args[0]) !== undefined) {
          return this.mul(this.constant(nodeA.value * this.constantValue(nodeB.args[0])), nodeB.args[1]);
        }
        if (nodeA.op !== 'const') {
          // Constant factors move outwards, where they meet and fold: a·(c·b) = c·(a·b).
          for (const [term, other] of [[a, b], [b, a]]) {
            const [factor, rest] = this.scaled(term);
            if (factor !== undefined) return this.mul(this.constant(factor), this.mul(rest, other));
          }
        }
        return this.hoistNegation('mul', nodeA, nodeB);
      case 'div':
        if (this.isConstant(b, 1)) return a;
        if (this.isConstant(b, -1)) return this.neg(a);
        if (this.isConstant(a, 0)) return this.constant(0);
        if (this.constantValue(a) < 0) return this.neg(this.div(this.constant(-nodeA.value), b));
        if (nodeB.op !== 'const' && this.scaled(a)[0] !== undefined) {
          const [factor, rest] = this.scaled(a);
          return this.mul(this.constant(factor), this.div(rest, b));
        }
        return this.hoistNegation('div', nodeA, nodeB);
      case 'neg':
        if (nodeA.op === 'neg') return nodeA.args[0];
        if (this.scaled(a)[0] !== undefined) return this.mul(this.constant(-this.scaled(a)[0]), this.scaled(a)[1]);
        return undefined;
      default:
        return undefined;
    }
  }

  /** [c, x] when the node is the product c·x of a constant and an expression, else []. */
  scaled(id) {
    const node = this.nodes[id];
    if (node.op !== 'mul' || this.nodes[node.args[0]].op !== 'const') return [];
    return [this.nodes[node.args[0]].value, node.args[1]];
  }

  /** (−a)·(−b) = a·b and (−a)·b = −(a·b), likewise for division. */
  hoistNegation(op, nodeA, nodeB) {
    const negatedA = nodeA.op === 'neg';
    const negatedB = nodeB.op === 'neg';
    if (!negatedA && !negatedB) return undefined;
    const product = this.apply(op, [negatedA ? nodeA.args[0] : nodeA.id, negatedB ? nodeB.args[0] : nodeB.id]);
    return negatedA && negatedB ? product : this.neg(product);
  }

  add(a, b) { return this.apply('add', [a, b]); }
  sub(a, b) { return this.apply('sub', [a, b]); }
  mul(a, b) { return this.apply('mul', [a, b]); }
  div(a, b) { return this.apply('div', [a, b]); }
  neg(a) { return this.apply('neg', [a]); }

  /** a^n for an integer n, by repeated squaring so the factors are shared. */
  integerPower(base, exponent) {
    if (exponent === 0) return this.constant(1);
    if (exponent < 0) return this.div(this.constant(1), this.integerPower(base, -exponent));
    if (exponent === 1) return base;
    const half = this.integerPower(base, Math.floor(exponent / 2));
    const square = this.mul(half, half);
    return exponent % 2 === 0 ? square : this.mul(square, base);
  }

  /** Ids reachable from the roots, in topological order. */
  reachable(roots) {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...this.nodes[id].args);
    }
    return [...seen].sort((a, b) => a - b);
  }
}
