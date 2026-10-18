/**
 * Algebraic normal form for the arithmetic operations (add, sub, mul, div, neg).
 *
 * An expression is a polynomial: a list of terms c · Π baseᵏ, where bases are graph nodes that are
 * not arithmetic (variables, parameters, function calls, and sums kept whole inside products) and
 * k is a non-zero integer, so quotients are negative powers. Equal normal forms rebuild to the same
 * node, which is what makes x·y − y·x, x/x and sin²u + cos²u cancel. Products of sums are not
 * expanded, so the emitted code never grows by distribution.
 */

const FLOAT32_MIN_NORMAL = 1.1754943508222875e-38;
const FLOAT32_MAX = 3.4028234663852886e38;

/** Folding two constants is only safe when the result is still an ordinary float32. */
export function representable(value) {
  return value === 0 || (Math.abs(value) >= FLOAT32_MIN_NORMAL && Math.abs(value) <= FLOAT32_MAX);
}

const ARITHMETIC = new Set(['add', 'sub', 'mul', 'div', 'neg']);

// A term is { coef, factors } with factors a Map base → power; a polynomial is an array of terms.
const term = (coef, factors = new Map()) => ({ coef, factors });
const keys = new WeakMap();
// Factor maps are never mutated after they are built, so their key is computed once.
function termKey(factors) {
  let key = keys.get(factors);
  if (key === undefined) {
    key = [...factors].sort((a, b) => a[0] - b[0]).map(([base, power]) => `${base}^${power}`).join('*');
    keys.set(factors, key);
  }
  return key;
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

function scale(poly, factor) {
  return poly.map(({ coef, factors }) => term(coef * factor, factors));
}

export class Algebra {
  constructor(graph) {
    this.graph = graph;
    this.normals = new Map();
  }

  isArithmetic(id) {
    return ARITHMETIC.has(this.graph.node(id).op);
  }

  /** The normal form of a node, read from its structure. */
  normal(id) {
    if (this.normals.has(id)) return this.normals.get(id);
    const node = this.graph.node(id);
    let poly;
    if (node.op === 'const') poly = node.value === 0 ? [] : [term(node.value)];
    else if (this.isArithmetic(id)) poly = this.combine(node.op, node.args);
    else poly = [term(1, new Map([[id, 1]]))];
    this.normals.set(id, poly);
    return poly;
  }

  /** The normal form of `op(args)` for an arithmetic operation, without creating the node. */
  combine(op, [a, b]) {
    let poly;
    switch (op) {
      case 'add':
        poly = this.sum(this.normal(a), this.normal(b));
        break;
      case 'sub':
        poly = this.sum(this.normal(a), scale(this.normal(b), -1));
        break;
      case 'neg':
        poly = scale(this.normal(a), -1);
        break;
      case 'mul':
        poly = this.product(a, b, 1);
        break;
      case 'div':
        poly = this.product(a, b, -1);
        break;
      default:
        throw new Error(`'${op}' is not arithmetic`);
    }
    return poly;
  }

  /**
   * A single term for a node used as a factor. A sum is split into its content (common coefficient
   * and factors) times a primitive sum with a fixed sign, so a·(u − v) and b·(v − u) share one base.
   */
  factor(id) {
    return this.factorize(this.normal(id));
  }

  /** ±content · primitive sum as one term (a single-term polynomial is its own term). */
  factorize(poly) {
    if (poly.length === 1) return poly[0];
    if (poly.length === 0) return term(0);
    // The primitive part has a fixed sign (its first non-constant term, in key order, is positive), so
    // u − v and v − u share one node. Its lead coefficient is also divided out when that saves
    // multiplications, as in 2x + 2πy − 2 = 2·(x + πy − 1), which then shares x + πy − 1.
    const { factors: common } = this.commonFactor(poly);
    const lead = poly.filter((t) => t.factors.size > 0).reduce((best, t) => (termKey(t.factors) < termKey(best.factors) ? t : best));
    const scaled = (divisor) => poly.map(({ coef, factors }) => term(coef / divisor, multiplyFactors(factors, common, -1)));
    const multiplications = (terms) => terms.filter((t) => t.factors.size > 0 && Math.abs(t.coef) !== 1).length;
    const monic = scaled(lead.coef);
    const content = multiplications(monic) + 1 < multiplications(poly) ? lead.coef : Math.sign(lead.coef);
    const primitive = content === lead.coef ? monic : scaled(content);
    const base = this.buildSum(primitive);
    return term(content, multiplyFactors(common, new Map([[base, 1]])));
  }

  /** a · b^sign as a polynomial; a zero factor gives 0, a sum inside a product stays one base. */
  product(a, b, sign) {
    const left = this.normal(a);
    const right = this.normal(b);
    if (left.length === 0 || (right.length === 0 && sign === 1)) return [];
    // A constant distributes over a sum (no new terms), so c·(u + 1) − c can cancel.
    const constant = (poly) => (poly.length === 1 && poly[0].factors.size === 0 ? poly[0].coef : undefined);
    if (constant(right) !== undefined && left.length > 1) return scale(left, sign === 1 ? constant(right) : 1 / constant(right));
    if (constant(left) !== undefined && right.length > 1 && sign === 1) return scale(right, constant(left));
    const x = this.factor(a);
    const y = this.factor(b);
    const coef = sign === 1 ? x.coef * y.coef : x.coef / y.coef;
    let factors = multiplyFactors(x.factors, y.factors, sign);
    if (representable(coef)) return [this.reduceRoots(term(coef, factors))];
    // Keep the second constant as a base rather than fold out of the float32 range.
    factors = multiplyFactors(factors, new Map([[this.graph.constant(y.coef), 1]]), sign);
    return [this.reduceRoots(term(x.coef, factors))];
  }

  /** sqrt(q)ᵏ with |k| ≥ 2 becomes q^(k/2) · sqrt(q)^(k mod 2). */
  reduceRoots(t) {
    for (const [base, power] of t.factors) {
      const node = this.graph.node(base);
      if (node.op !== 'sqrt' || Math.abs(power) < 2) continue;
      const whole = Math.trunc(power / 2);
      const factors = new Map(t.factors);
      if (power - 2 * whole === 0) factors.delete(base);
      else factors.set(base, power - 2 * whole);
      const inner = this.factor(node.args[0]);
      let result = term(t.coef * inner.coef ** whole, factors);
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
    for (const { coef, factors } of [...left, ...right]) {
      const key = termKey(factors);
      const existing = terms.get(key);
      if (existing) existing.coef += coef;
      else terms.set(key, term(coef, factors));
    }
    return this.pythagoras([...terms.values()].filter((t) => t.coef !== 0));
  }

  /** c·M·sin²u + c·M·cos²u = c·M. */
  pythagoras(poly) {
    for (const [index, sine] of poly.entries()) {
      for (const [base, power] of sine.factors) {
        const node = this.graph.node(base);
        if (node.op !== 'sin' || power !== 2) continue;
        const cosine = this.graph.intern({ op: 'cos', args: node.args });
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

  // ------------------------------------------------------------------------------------------------
  // Rebuilding canonical nodes from normal forms.

  raw(op, args) {
    const ordered = op === 'add' || op === 'mul' ? [...args].sort((a, b) => this.rank(a) - this.rank(b)) : args;
    return this.graph.intern({ op, args: ordered });
  }

  rank(id) {
    return this.graph.node(id).op === 'const' ? -1 : id;
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
  product_(factors) {
    const ordered = [...factors].sort((a, b) => b[0] - a[0]);
    let result;
    for (const [base, exponent] of ordered) {
      const powered = this.power(base, exponent);
      result = result === undefined ? powered : this.raw('mul', [result, powered]);
    }
    return result;
  }

  monomial({ coef, factors }) {
    const numerator = this.product_([...factors].filter(([, power]) => power > 0));
    const denominator = this.product_([...factors].filter(([, power]) => power < 0).map(([base, power]) => [base, -power]));
    if (numerator === undefined && denominator === undefined) return this.graph.constant(coef);
    if (numerator === undefined) return this.raw('div', [this.graph.constant(coef), denominator]);
    const result = denominator === undefined ? numerator : this.raw('div', [numerator, denominator]);
    if (coef === 1) return result;
    return coef === -1 ? this.raw('neg', [result]) : this.raw('mul', [this.graph.constant(coef), result]);
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
    const magnitude = Math.abs(first.coef);
    const coef = poly.every((t) => Math.abs(t.coef) === magnitude) ? magnitude : 1;
    return term(coef, common);
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

  /** Σ terms, positive terms first, the rest subtracted, in a deterministic order. */
  buildSum(poly) {
    const ordered = [...poly].sort((a, b) => (b.coef > 0) - (a.coef > 0) || (termKey(a.factors) < termKey(b.factors) ? -1 : 1));
    let result;
    for (const t of ordered) {
      if (result === undefined) {
        result = this.monomial(t);
        continue;
      }
      const magnitude = this.monomial(term(Math.abs(t.coef), t.factors));
      result = this.raw(t.coef < 0 ? 'sub' : 'add', [result, magnitude]);
    }
    this.normals.set(result, poly);
    return result;
  }
}
