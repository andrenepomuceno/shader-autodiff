/**
 * Algebraic normal form for the arithmetic operations (add, sub, mul, div, neg).
 *
 * An expression is a polynomial: a list of terms c · Π baseᵏ, where bases are graph nodes that are
 * not arithmetic (variables, parameters, function calls, and sums kept whole inside products) and
 * k is a non-zero integer, so quotients are negative powers. Equal normal forms rebuild to the same
 * node, which is what makes x·y − y·x, x/x and sin²u + cos²u cancel. Products of sums are not
 * expanded, so the emitted code never grows by distribution.
 *
 * Coefficient arithmetic never changes what the emitted float32 code computes beyond rounding: a
 * merged coefficient must be an ordinary float32, and dividing by a constant only becomes a
 * multiplication when the reciprocal is exact (a power of two); otherwise the constant stays a base,
 * so x/49 is still emitted as x / 49.0.
 */

const FLOAT32_MIN_NORMAL = 1.1754943508222875e-38;
const FLOAT32_MAX = 3.4028234663852886e38;

export const ARITHMETIC = new Set(['add', 'sub', 'mul', 'div', 'neg']);

/** Folding constants is only safe when the result is still an ordinary float32. */
export function representable(value) {
  return value === 0 || (Math.abs(value) >= FLOAT32_MIN_NORMAL && Math.abs(value) <= FLOAT32_MAX);
}

function exactReciprocal(value) {
  return Number.isInteger(Math.log2(Math.abs(value))) && representable(1 / value);
}

// A term is { coef, factors } with factors a Map base → power; a polynomial is an array of terms.
const term = (coef, factors = new Map()) => ({ coef, factors });
const sorted = (factors) => [...factors].sort((a, b) => a[0] - b[0]);
const keys = new WeakMap();
// Factor maps are never mutated after they are built, so their key is computed once.
function termKey(factors) {
  let key = keys.get(factors);
  if (key === undefined) {
    key = sorted(factors).map(([base, power]) => `${base}^${power}`).join('*');
    keys.set(factors, key);
  }
  return key;
}

/** Numeric order of factor maps: by base id, then power, shorter first; the constant term first. */
function compareFactors(left, right) {
  const a = sorted(left);
  const b = sorted(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index][0] !== b[index][0]) return a[index][0] - b[index][0];
    if (a[index][1] !== b[index][1]) return a[index][1] - b[index][1];
  }
  return a.length - b.length;
}

function multiplyFactors(left, right, sign = 1) {
  const factors = new Map(left);
  for (const [base, power] of right) {
    const total = (factors.get(base) ?? 0) + sign * power;
    if (total === 0) factors.delete(base);
    else factors.set(base, total);
  }
  return factors;
}

/** The polynomial times a constant, or undefined when a coefficient would leave float32. */
function scale(poly, factor) {
  const scaled = poly.map(({ coef, factors }) => term(coef * factor, factors));
  return scaled.every((t) => representable(t.coef)) ? scaled : undefined;
}

const negate = (poly) => poly.map(({ coef, factors }) => term(-coef, factors));

export class Algebra {
  constructor(graph) {
    this.graph = graph;
    this.normals = new Map();
    this.factors = new Map();
  }

  /** The normal form of a node, read from its structure. */
  normal(id) {
    if (this.normals.has(id)) return this.normals.get(id);
    const node = this.graph.node(id);
    let poly;
    if (node.op === 'const') poly = node.value === 0 ? [] : [term(node.value)];
    else if (ARITHMETIC.has(node.op)) poly = this.combine(node.op, node.args);
    else poly = [term(1, new Map([[id, 1]]))];
    this.normals.set(id, poly);
    return poly;
  }

  /** The normal form of `op(args)` for an arithmetic operation, without creating the node. */
  combine(op, [a, b]) {
    switch (op) {
      case 'add': return this.sum(this.normal(a), this.normal(b));
      case 'sub': return this.sum(this.normal(a), negate(this.normal(b)));
      case 'neg': return negate(this.normal(a));
      case 'mul': return this.product(a, b, 1);
      case 'div': return this.product(a, b, -1);
      default: throw new Error(`'${op}' is not arithmetic`);
    }
  }

  /** A node used as a factor, as one term (a sum becomes ±content · primitive sum). */
  factor(id) {
    if (!this.factors.has(id)) this.factors.set(id, this.factorize(this.normal(id)));
    return this.factors.get(id);
  }

  /**
   * ±content · primitive as one term (a single-term polynomial is its own term). The primitive part
   * has a fixed sign, its first non-constant term in numeric order being positive, so u − v and
   * v − u share one node. Its lead coefficient is also divided out when that is exact and saves
   * multiplications, as in 2x + 2πy − 2 = 2·(x + πy − 1), which then shares x + πy − 1.
   */
  factorize(poly) {
    if (poly.length === 1) return poly[0];
    if (poly.length === 0) return term(0);
    // Terms kept apart because their merged coefficient would leave float32 must stay whole.
    const repeated = new Set(poly.map((t) => termKey(t.factors))).size < poly.length;
    const common = repeated ? new Map() : this.commonFactor(poly);
    const reduced = poly.map(({ coef, factors }) => term(coef, multiplyFactors(factors, common, -1)));
    const lead = reduced.filter((t) => t.factors.size > 0).reduce((best, t) => (compareFactors(t.factors, best.factors) < 0 ? t : best));
    const multiplications = (terms) => terms.filter((t) => t.factors.size > 0 && Math.abs(t.coef) !== 1).length;
    const monic = reduced.map(({ coef, factors }) => term(coef / lead.coef, factors));
    const exact = monic.every((t, index) => t.coef * lead.coef === reduced[index].coef && representable(t.coef));
    const useMonic = exact && multiplications(monic) + 1 < multiplications(reduced);
    const content = useMonic ? lead.coef : Math.sign(lead.coef);
    const primitive = useMonic ? monic : reduced.map(({ coef, factors }) => term(coef * content, factors));
    const base = this.buildSum(primitive);
    return term(content, multiplyFactors(common, new Map([[base, 1]])));
  }

  /** a · b^sign as a polynomial; a sum inside a product stays one base. */
  product(a, b, sign) {
    const left = this.normal(a);
    const right = this.normal(b);
    if (right.length === 0 && sign === -1) throw new RangeError('division by an expression that is identically zero');
    if (left.length === 0 || right.length === 0) return [];
    // A constant distributes over a sum (no new terms), so c·(u + 1) − c can cancel; a divisor only
    // when its reciprocal is exact.
    const constant = (poly) => (poly.length === 1 && poly[0].factors.size === 0 ? poly[0].coef : undefined);
    const c = constant(right);
    if (c !== undefined && left.length > 1 && (sign === 1 || exactReciprocal(c))) {
      const scaled = scale(left, sign === 1 ? c : 1 / c);
      if (scaled) return scaled;
    }
    if (constant(left) !== undefined && right.length > 1 && sign === 1) {
      const scaled = scale(right, constant(left));
      if (scaled) return scaled;
    }
    const x = this.factor(a);
    const y = this.factor(b);
    const factors = multiplyFactors(x.factors, y.factors, sign);
    const coef = sign === 1 ? x.coef * y.coef : x.coef / y.coef;
    if (representable(coef) && (sign === 1 || exactReciprocal(y.coef))) return [this.reduceRoots(term(coef, factors))];
    // Keep |y.coef| as a base: no rounding of a reciprocal, no coefficient outside float32.
    const magnitude = Math.abs(y.coef);
    const kept = magnitude === 1 ? factors : multiplyFactors(factors, new Map([[this.graph.constant(magnitude), 1]]), sign);
    return [this.reduceRoots(term(x.coef * Math.sign(y.coef), kept))];
  }

  /** sqrt(q)ᵏ with |k| ≥ 2 becomes q^(k/2) · sqrt(q)^(k mod 2). */
  reduceRoots(t) {
    for (const [base, power] of t.factors) {
      const node = this.graph.node(base);
      if (node.op !== 'sqrt' || Math.abs(power) < 2) continue;
      const whole = Math.trunc(power / 2);
      const inner = this.factor(node.args[0]);
      const coef = t.coef * inner.coef ** whole;
      if (!representable(coef) || (whole < 0 && !exactReciprocal(inner.coef))) continue;
      const factors = new Map(t.factors);
      if (power - 2 * whole === 0) factors.delete(base);
      else factors.set(base, power - 2 * whole);
      let result = term(coef, factors);
      for (let index = 0; index < Math.abs(whole); index += 1) {
        result = term(result.coef, multiplyFactors(result.factors, inner.factors, Math.sign(whole)));
      }
      return this.reduceRoots(result);
    }
    return t;
  }

  /** Sum of two polynomials with like terms combined and sin²u + cos²u rewritten. */
  sum(left, right) {
    const terms = new Map();
    let separate = 0;
    for (const { coef, factors } of [...left, ...right]) {
      const key = termKey(factors);
      const existing = terms.get(key);
      if (existing && representable(existing.coef + coef)) existing.coef += coef;
      // A merged coefficient outside float32 keeps the terms apart, as the source wrote them.
      else terms.set(existing ? `${key}#${separate++}` : key, term(coef, factors));
    }
    return this.pythagoras([...terms.values()].filter((t) => t.coef !== 0));
  }

  /** c·M·sin²u + c·M·cos²u = c·M. */
  pythagoras(poly) {
    for (const [index, sine] of poly.entries()) {
      for (const [base, power] of sine.factors) {
        const node = this.graph.node(base);
        if (node.op !== 'sin' || power !== 2) continue;
        const cosine = this.graph.lookup('cos', node.args);
        if (cosine === undefined) continue;
        const rest = new Map(sine.factors);
        rest.delete(base);
        const key = termKey(multiplyFactors(rest, new Map([[cosine, 2]])));
        const match = poly.findIndex((t, other) => other !== index && t.coef === sine.coef && termKey(t.factors) === key);
        if (match < 0) continue;
        const remaining = poly.filter((_, other) => other !== index && other !== match);
        return this.sum(remaining, [term(sine.coef, rest)]);
      }
    }
    return poly;
  }

  /** Factors common to every term, with the smallest exponent of the same sign. */
  commonFactor(poly) {
    const [first, ...others] = poly;
    const common = new Map();
    for (const [base, power] of first.factors) {
      let shared = power;
      for (const { factors } of others) {
        const other = factors.get(base);
        if (other === undefined || Math.sign(other) !== Math.sign(power)) {
          shared = 0;
          break;
        }
        shared = Math.sign(power) * Math.min(Math.abs(shared), Math.abs(other));
      }
      if (shared !== 0) common.set(base, shared);
    }
    return common;
  }

  // ------------------------------------------------------------------------------------------------
  // Rebuilding canonical nodes from normal forms.

  raw(op, args) {
    const ordered = op === 'add' || op === 'mul' ? [...args].sort((a, b) => this.graph.rank(a) - this.graph.rank(b)) : args;
    return this.graph.intern({ op, args: ordered });
  }

  /** baseⁿ for n ≥ 1 by repeated squaring. */
  power(base, exponent) {
    if (exponent === 1) return base;
    const half = this.power(base, Math.floor(exponent / 2));
    const square = this.raw('mul', [half, half]);
    return exponent % 2 === 0 ? square : this.raw('mul', [square, base]);
  }

  /**
   * Π baseᵏ over positive k. Later (more derived) bases are multiplied first, so x·F, y·F and z·F
   * share the product F.
   */
  powerProduct(factors) {
    let result;
    for (const [base, exponent] of [...factors].sort((a, b) => b[0] - a[0])) {
      const powered = this.power(base, exponent);
      result = result === undefined ? powered : this.raw('mul', [result, powered]);
    }
    return result;
  }

  monomial({ coef, factors }) {
    const numerator = this.powerProduct([...factors].filter(([, power]) => power > 0));
    const denominator = this.powerProduct([...factors].filter(([, power]) => power < 0).map(([base, power]) => [base, -power]));
    if (numerator === undefined && denominator === undefined) return this.graph.constant(coef);
    if (numerator === undefined) return this.raw('div', [this.graph.constant(coef), denominator]);
    const result = denominator === undefined ? numerator : this.raw('div', [numerator, denominator]);
    if (coef === 1) return result;
    return coef === -1 ? this.raw('neg', [result]) : this.raw('mul', [this.graph.constant(coef), result]);
  }

  /**
   * The canonical node of a polynomial. A sum is always built as ±content · primitive, so it is the
   * same node whether it is used on its own or as a factor.
   */
  build(poly) {
    const id = poly.length === 0 ? this.graph.constant(0) : this.monomial(this.factorize(poly));
    if (!this.normals.has(id)) this.normals.set(id, poly);
    return id;
  }

  /**
   * Σ terms in numeric order (starting from the first positive term, the rest added or subtracted),
   * so appending a term with a newer base extends the previous chain instead of rebuilding it.
   */
  buildSum(poly) {
    const ordered = [...poly].sort((a, b) => compareFactors(a.factors, b.factors));
    const head = Math.max(0, ordered.findIndex((t) => t.coef > 0));
    let result = this.monomial(ordered[head]);
    for (const [index, t] of ordered.entries()) {
      if (index === head) continue;
      result = this.raw(t.coef < 0 ? 'sub' : 'add', [result, this.monomial(term(Math.abs(t.coef), t.factors))]);
    }
    this.normals.set(result, poly);
    return result;
  }
}
