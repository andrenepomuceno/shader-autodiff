import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';

const VARIABLES = ['x', 'y', 'z'];
const PARAMETERS = ['a', 'b'];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function centralDifference(evaluate, env, name) {
  const h = 1e-6 * Math.max(1, Math.abs(env[name]));
  const plus = evaluate({ ...env, [name]: env[name] + h }).value;
  const minus = evaluate({ ...env, [name]: env[name] - h }).value;
  return (plus - minus) / (2 * h);
}

function assertClose(actual, expected, message) {
  const tolerance = 1e-5 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function checkGradient(text, env, options = {}) {
  const compiled = compile(text, { variables: VARIABLES, parameters: PARAMETERS, ...options });
  const valueOnly = compile(text, { variables: VARIABLES, parameters: PARAMETERS, ...options, order: 0 });
  const { value, gradient } = compiled.evaluate(env);
  assert.equal(value, valueOnly.evaluate(env).value);
  VARIABLES.forEach((name, index) => {
    assertClose(gradient[index], centralDifference(valueOnly.evaluate, env, name), `d(${text})/d${name} at ${JSON.stringify(env)}`);
  });
}

const CASES = [
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

test('gradients match central differences on a catalogue of expressions', () => {
  const next = random(1);
  for (const text of CASES) {
    for (let trial = 0; trial < 20; trial += 1) {
      const env = { x: 0.3 + 2 * next(), y: 0.3 + 2 * next(), z: 0.3 + 2 * next(), a: next(), b: 0.5 + next() };
      checkGradient(text, env);
    }
  }
});

test('derived symbols are substituted before differentiation', () => {
  const env = { x: 1.1, y: -0.4, z: 0.7, a: 0.8, b: 0.3 };
  checkGradient('(1 + a/(2*sqrt(r^2 + b^2)))^4', env, { derived: { r: 'sqrt(x*x + y*y + z*z)' } });
  checkGradient('q * s', env, { derived: { q: 's + x', s: 'y * z' } });
});

function randomExpression(next, depth) {
  const leaf = () => (next() < 0.7 ? VARIABLES[Math.floor(next() * 3)] : (0.5 + next() * 2).toFixed(2));
  if (depth === 0 || next() < 0.2) return leaf();
  const sub = () => randomExpression(next, depth - 1);
  const pick = Math.floor(next() * 12);
  switch (pick) {
    case 0: return `(${sub()} + ${sub()})`;
    case 1: return `(${sub()} - ${sub()})`;
    case 2: return `(${sub()} * ${sub()})`;
    case 3: return `(${sub()} / (1.5 + ${sub()} * ${sub()}))`;
    case 4: return `(${sub()})^${1 + Math.floor(next() * 4)}`;
    case 5: return `sin(${sub()})`;
    case 6: return `cos(${sub()})`;
    case 7: return `exp(-(${sub()})^2)`;
    case 8: return `sqrt(1 + (${sub()})^2)`;
    case 9: return `log(1 + (${sub()})^2)`;
    case 10: return `atan(${sub()})`;
    default: return `tanh(${sub()})`;
  }
}

test('gradients match central differences on random smooth expressions', () => {
  const next = random(42);
  for (let index = 0; index < 300; index += 1) {
    const text = randomExpression(next, 4);
    const env = { x: next() * 2 - 1, y: next() * 2 - 1, z: next() * 2 - 1, a: 0, b: 0 };
    checkGradient(text, env);
  }
});

test('derivatives that do not depend on a variable are pruned to zero', () => {
  const compiled = compile('sin(x) * a', { variables: VARIABLES, parameters: PARAMETERS });
  assert.deepEqual(compiled.evaluate({ x: 0, y: 1, z: 2, a: 2, b: 0 }).gradient, [2, 0, 0]);
  assert.match(compiled.glsl('f'), /grad = vec3\(a \* cos\(p\.x\), 0\.0, 0\.0\);/);
});

test('emitted JavaScript agrees with the interpreter', () => {
  const next = random(7);
  for (const text of CASES) {
    const compiled = compile(text, { variables: VARIABLES, parameters: PARAMETERS });
    const emitted = new Function(`return ${compiled.js('f')}`)();
    for (let trial = 0; trial < 5; trial += 1) {
      const env = { x: 0.3 + 2 * next(), y: 0.3 + 2 * next(), z: 0.3 + 2 * next(), a: next(), b: 0.5 + next() };
      assert.deepEqual(emitted(env), compiled.evaluate(env), text);
    }
  }
});
