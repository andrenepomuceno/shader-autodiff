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
    const simplified = this.simplify(op, args);
    if (simplified !== undefined) return simplified;
    const ordered = COMMUTATIVE.has(op) ? [...args].sort((a, b) => a - b) : args;
    return this.intern({ op, args: ordered });
  }

  simplify(op, [a, b]) {
    const nodeA = this.nodes[a];
    const nodeB = b === undefined ? undefined : this.nodes[b];
    switch (op) {
      case 'add':
        if (this.isConstant(a, 0)) return b;
        if (this.isConstant(b, 0)) return a;
        if (a === b) return this.mul(this.constant(2), a);
        if (nodeB.op === 'neg') return this.sub(a, nodeB.args[0]);
        if (nodeA.op === 'neg') return this.sub(b, nodeA.args[0]);
        return undefined;
      case 'sub':
        if (this.isConstant(b, 0)) return a;
        if (this.isConstant(a, 0)) return this.neg(b);
        if (a === b) return this.constant(0);
        if (nodeB.op === 'neg') return this.add(a, nodeB.args[0]);
        return undefined;
      case 'mul':
        if (this.isConstant(a, 0) || this.isConstant(b, 0)) return this.constant(0);
        if (this.isConstant(a, 1)) return b;
        if (this.isConstant(b, 1)) return a;
        if (this.isConstant(a, -1)) return this.neg(b);
        if (this.isConstant(b, -1)) return this.neg(a);
        return this.hoistNegation('mul', nodeA, nodeB);
      case 'div':
        if (this.isConstant(b, 1)) return a;
        if (this.isConstant(b, -1)) return this.neg(a);
        if (this.isConstant(a, 0)) return this.constant(0);
        return this.hoistNegation('div', nodeA, nodeB);
      case 'neg':
        if (nodeA.op === 'neg') return nodeA.args[0];
        return undefined;
      default:
        return undefined;
    }
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
