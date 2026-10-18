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

/**
 * Fields in x, y, z with parameters a, b, t for the benchmarks: realistic SDFs (from the three.js
 * example presets), the Schwarzschild lens metric component, and the heaviest random expressions
 * of `randomExpression`.
 */
export function benchmarkFields() {
  const fields = [
    { id: 'sphere', expression: 'sqrt(x^2 + y^2 + z^2) - 1' },
    {
      id: 'torus-ball-smin',
      derived: {
        q: '2*a*x + 0.5*t',
        yr: 'y*cos(q) - z*sin(q)',
        zr: 'y*sin(q) + z*cos(q)',
        torus: 'max(abs(sqrt(x^2 + zr^2) - 1), abs(yr)) - 0.2',
        ball: 'sqrt(x^2 + (y - 0.7*sin(t))^2 + z^2) - 0.55',
        k: '0.05 + 0.5*b',
        h: 'clamp(0.5 + 0.5*(ball - torus)/k, 0, 1)',
      },
      expression: 'mix(ball, torus, h) - k*h*(1 - h)',
    },
    {
      id: 'gyroid-ball',
      derived: {
        k: '4 + 4*a',
        g: 'sin(k*x + t)*cos(k*y) + sin(k*y)*cos(k*z) + sin(k*z)*cos(k*x + t)',
        shell: 'abs(g)/k - 0.01 - 0.06*b',
      },
      expression: 'max(shell, sqrt(x^2 + y^2 + z^2) - 1.2)',
    },
    {
      id: 'blobs-lse',
      derived: {
        r: '0.3 + 0.3*a',
        s1: 'sqrt((x - cos(t))^2 + y^2 + (z - sin(t))^2) - r',
        s2: 'sqrt((x + cos(t))^2 + (y - 0.5*sin(1.3*t))^2 + (z + sin(t))^2) - r',
        s3: 'sqrt(x^2 + (y - 0.8*cos(0.7*t))^2 + z^2) - r',
        k: '2 + 14*(1 - b)',
      },
      expression: '-log(exp(-k*s1) + exp(-k*s2) + exp(-k*s3))/k',
    },
    { id: 'schwarzschild', expression: '(1 + a/(2*sqrt(x^2 + y^2 + z^2 + b^2)))^4' },
  ];
  // Random expressions guard denominators with `1.5 + a * b`, which only holds for positive inputs:
  // `domain` is the box the precision test samples (the SDFs use [-2, 2]³).
  const next = random(2028);
  const draws = Array.from({ length: 30 }, () => randomExpression(next, 6)).sort((a, b) => b.length - a.length);
  draws.slice(0, 3).forEach((expression, index) => fields.push({ id: `random-${index + 1}`, expression, domain: [0.3, 2.3] }));
  return fields;
}

/** Error of `actual` against `expected`, relative to the size of the reference group. */
export function groupError(actual, expected) {
  const scale = 1 + Math.max(...expected.map(Math.abs));
  return Math.max(...actual.map((value, index) => Math.abs(value - expected[index]))) / scale;
}
