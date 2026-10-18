import { Algebra } from './algebra.js';
import { OPERATIONS } from './operations.js';

const COMMUTATIVE = new Set(['min', 'max']);
const ARITHMETIC = new Set(['add', 'sub', 'mul', 'div', 'neg']);

/**
 * An SSA DAG. Nodes are hash-consed, so structurally equal subexpressions share one id, and ids
 * are assigned in creation order, which is always a topological order.
 */
export class Graph {
  constructor() {
    this.nodes = [];
    this.index = new Map();
    this.algebra = new Algebra(this);
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
    // Arithmetic goes through its algebraic normal form, so equal expressions become one node.
    if (ARITHMETIC.has(op)) return this.algebra.build(this.algebra.combine(op, args));
    const ordered = COMMUTATIVE.has(op) ? [...args].sort((a, b) => this.rank(a) - this.rank(b)) : args;
    return this.intern({ op, args: ordered });
  }

  /** Commutative operands are ordered constants first, then by id. */
  rank(id) {
    return this.nodes[id].op === 'const' ? -1 : id;
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
