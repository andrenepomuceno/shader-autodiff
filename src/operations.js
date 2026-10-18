/**
 * Every graph operation: its arity, its value in JS and its forward-mode tangent rule.
 *
 * `tangent(g, args, self, tangents)` builds the tangent of node `self` from the tangents of its
 * arguments, where a `null` tangent means "identically zero"; it returns `null` when the result is
 * zero too, which is how derivatives that do not depend on a variable are pruned.
 */

const sum = (g, a, b) => (a === null ? b : b === null ? a : g.add(a, b));
const difference = (g, a, b) => (b === null ? a : a === null ? g.neg(b) : g.sub(a, b));
const scale = (g, factor, tangent) => (tangent === null ? null : g.mul(factor, tangent));
const zeroIfNull = (g, tangent) => (tangent === null ? g.constant(0) : tangent);

const unary = (evaluate, derivative) => ({
  arity: 1,
  evaluate,
  tangent: (g, [a], self, [da]) => (da === null ? null : g.mul(derivative(g, a, self), da)),
});

const constantPiecewise = (evaluate) => ({ arity: 1, evaluate, tangent: () => null });

const oneOverSqrtOneMinusSquare = (g, a) => g.div(g.constant(1), g.apply('sqrt', [g.sub(g.constant(1), g.mul(a, a))]));

const select = (g, a, b, whenLess, otherwise) =>
  whenLess === null && otherwise === null
    ? null
    : g.apply('select', [a, b, zeroIfNull(g, whenLess), zeroIfNull(g, otherwise)]);

export const OPERATIONS = {
  add: { arity: 2, evaluate: (a, b) => a + b, tangent: (g, _, __, [da, db]) => sum(g, da, db) },
  sub: { arity: 2, evaluate: (a, b) => a - b, tangent: (g, _, __, [da, db]) => difference(g, da, db) },
  mul: {
    arity: 2,
    evaluate: (a, b) => a * b,
    tangent: (g, [a, b], _, [da, db]) => sum(g, scale(g, b, da), scale(g, a, db)),
  },
  // d(a/b) = (da - (a/b)·db) / b
  div: {
    arity: 2,
    evaluate: (a, b) => a / b,
    tangent: (g, [, b], self, [da, db]) => {
      const numerator = difference(g, da, scale(g, self, db));
      return numerator === null ? null : g.div(numerator, b);
    },
  },
  neg: { arity: 1, evaluate: (a) => -a, tangent: (g, _, __, [da]) => (da === null ? null : g.neg(da)) },

  sin: unary(Math.sin, (g, a) => g.apply('cos', [a])),
  cos: unary(Math.cos, (g, a) => g.neg(g.apply('sin', [a]))),
  tan: unary(Math.tan, (g, _, self) => g.add(g.constant(1), g.mul(self, self))),
  asin: unary(Math.asin, oneOverSqrtOneMinusSquare),
  acos: unary(Math.acos, (g, a) => g.neg(oneOverSqrtOneMinusSquare(g, a))),
  atan: unary(Math.atan, (g, a) => g.div(g.constant(1), g.add(g.constant(1), g.mul(a, a)))),
  sinh: unary(Math.sinh, (g, a) => g.apply('cosh', [a])),
  cosh: unary(Math.cosh, (g, a) => g.apply('sinh', [a])),
  tanh: unary(Math.tanh, (g, _, self) => g.sub(g.constant(1), g.mul(self, self))),
  exp: unary(Math.exp, (_, __, self) => self),
  log: { arity: 1, evaluate: Math.log, tangent: (g, [a], _, [da]) => (da === null ? null : g.div(da, a)) },
  sqrt: {
    arity: 1,
    evaluate: Math.sqrt,
    tangent: (g, _, self, [da]) => (da === null ? null : g.div(da, g.mul(g.constant(2), self))),
  },
  // Subgradient: sign(0) = 0.
  abs: unary(Math.abs, (g, a) => g.apply('sign', [a])),
  sign: constantPiecewise(Math.sign),
  floor: constantPiecewise(Math.floor),

  // atan2(y, x): d = (x·dy − y·dx) / (x² + y²)
  atan2: {
    arity: 2,
    evaluate: Math.atan2,
    tangent: (g, [y, x], _, [dy, dx]) => {
      const numerator = difference(g, scale(g, x, dy), scale(g, y, dx));
      return numerator === null ? null : g.div(numerator, g.add(g.mul(x, x), g.mul(y, y)));
    },
  },
  // d(a^b) = b·a^(b−1)·da + a^b·log(a)·db
  pow: {
    arity: 2,
    evaluate: Math.pow,
    tangent: (g, [a, b], self, [da, db]) => {
      const fromBase = da === null ? null : g.mul(g.mul(b, g.apply('pow', [a, g.sub(b, g.constant(1))])), da);
      const fromExponent = db === null ? null : g.mul(g.mul(self, g.apply('log', [a])), db);
      return sum(g, fromBase, fromExponent);
    },
  },
  // At ties the tangent is one of the two one-sided derivatives.
  min: {
    arity: 2,
    evaluate: Math.min,
    tangent: (g, [a, b], _, [da, db]) => select(g, a, b, da, db),
  },
  max: {
    arity: 2,
    evaluate: Math.max,
    tangent: (g, [a, b], _, [da, db]) => select(g, a, b, db, da),
  },
  /** select(a, b, c, d) = a < b ? c : d */
  select: {
    arity: 4,
    evaluate: (a, b, c, d) => (a < b ? c : d),
    tangent: (g, [a, b], _, [, , dc, dd]) => select(g, a, b, dc, dd),
  },
};

/** Functions callable from expressions, with their arity. `pow` and `mod` are lowered by the builder. */
export const FUNCTIONS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  sinh: 1, cosh: 1, tanh: 1, exp: 1, log: 1, sqrt: 1,
  abs: 1, sign: 1, floor: 1, min: 2, max: 2, pow: 2, mod: 2,
};

export const CONSTANTS = { pi: Math.PI, E: Math.E };
