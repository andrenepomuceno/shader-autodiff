// Expressions and helpers shared by the GPU agreement pages.

export const EXPRESSIONS = [
  'x + y * z - x / y',
  '-x^2 + y^3 - z^-2',
  'x^0.5 + y^-0.5 + z^1.7',
  'pow(x, y) + pow(2, z) + E^x',
  'sin(x) * cos(y) + tan(z)',
  'asin(x / 4) + acos(y / 4) + atan(z)',
  'atan2(y, x) + atan2(x, z)',
  'sinh(x) + cosh(y) * tanh(z)',
  'exp(x * y) + log(z)',
  'sqrt(x*x + y*y + z*z)',
  'abs(x - y) + sign(z) * x',
  'min(x, y) + max(y * z, x)',
  'floor(x) * y + mod(z, 0.7) + mod(x * y, z)',
  '(1 + a/(2*sqrt(x^2 + y^2 + z^2 + b^2)))^4',
  'exp(-(x*x + y*y) / (2 * b * b)) * a',
  'x / (x + y) / (y + z)',
  '(x - y)^2 * (x - y) + x*x - x*x',
  '3 + a * b',
];

export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function randomExpression(next, depth) {
  const leaf = () => (next() < 0.7 ? 'xyz'[Math.floor(next() * 3)] : (0.5 + next() * 2).toFixed(2));
  if (depth === 0 || next() < 0.2) return leaf();
  const sub = () => randomExpression(next, depth - 1);
  const forms = [
    () => `(${sub()} + ${sub()})`, () => `(${sub()} - ${sub()})`, () => `(${sub()} * ${sub()})`,
    () => `(${sub()} / (1.5 + ${sub()} * ${sub()}))`, () => `(${sub()})^${1 + Math.floor(next() * 4)}`,
    () => `sin(${sub()})`, () => `cos(${sub()})`, () => `exp(-(${sub()})^2)`, () => `sqrt(1 + (${sub()})^2)`,
    () => `log(1 + (${sub()})^2)`, () => `atan(${sub()})`, () => `tanh(${sub()})`,
  ];
  return forms[Math.floor(next() * forms.length)]();
}

/** Error of `actual` against `expected`, relative to the size of the reference group. */
export function groupError(actual, expected) {
  const scale = 1 + Math.max(...expected.map(Math.abs));
  return Math.max(...actual.map((value, index) => Math.abs(value - expected[index]))) / scale;
}
