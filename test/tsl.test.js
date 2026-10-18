import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, createProgram } from '../src/index.js';

/** A numeric stand-in for `three/tsl`: every node is just its value. */
const NUMERIC_TSL = {
  float: (value) => value,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  negate: (a) => -a,
  lessThan: (a, b) => a < b,
  select: (condition, a, b) => (condition ? a : b),
  atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
  vec2: (...components) => ({ kind: 'vec2', components }),
  vec3: (...components) => ({ kind: 'vec3', components }),
  vec4: (...components) => ({ kind: 'vec4', components }),
  mat2: (...components) => ({ kind: 'mat2', components }),
  mat3: (...components) => ({ kind: 'mat3', components }),
  mat4: (...components) => ({ kind: 'mat4', components }),
  ...Object.fromEntries(['sin', 'cos', 'tan', 'asin', 'acos', 'exp', 'log', 'sqrt', 'abs', 'sign', 'floor', 'min', 'max', 'pow']
    .map((name) => [name, Math[name]])),
};

const CASES = [
  'x + y * z - x / y',
  '-x^2 + y^3 - z^-2 + x^1.5',
  'pow(x, y) + exp2(z) + log2(x) + E^x',
  'sin(x) * cos(y) + tan(z) + asin(x / 4) + acos(y / 4) + atan(z)',
  'atan2(y, x) + atan2(x, -z)',
  'sinh(x) + cosh(y) * tanh(z) + tanh(-30 * x)',
  'abs(x - y) + sign(z) * x + floor(x) * y + mod(z, 0.7) + fract(x * 3)',
  'min(x, y) + max(y * z, x) + clamp(x * y, 0.5, 2) + smoothstep(0.2, 2.1, z) + step(1, x)',
  '(1 + a/(2*sqrt(x^2 + y^2 + z^2 + b^2)))^4',
];

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) <= 1e-12 * (1 + Math.abs(expected)), `${message}: ${actual} vs ${expected}`);

test('TSL nodes compute the same values, gradients and Hessians as the evaluator', () => {
  const env = { x: 0.9, y: 1.7, z: 0.4, a: 0.3, b: 1.1 };
  for (const text of CASES) {
    const compiled = compile(text, { variables: ['x', 'y', 'z'], parameters: ['a', 'b'], order: 2 });
    const expected = compiled.evaluate(env);
    const nodes = compiled.tsl(NUMERIC_TSL, { inputs: { x: env.x, y: env.y, z: env.z }, parameters: { a: env.a, b: env.b } });
    close(nodes.value, expected.value, `value of ${text}`);
    assert.equal(nodes.gradient.kind, 'vec3');
    nodes.gradient.components.forEach((value, i) => close(value, expected.gradient[i], `gradient ${i} of ${text}`));
    assert.equal(nodes.hessian.kind, 'mat3');
    nodes.hessian.components.forEach((value, k) => close(value, expected.hessian[k % 3][Math.floor(k / 3)], `hessian ${k} of ${text}`));
  }
});

test('inputs may be a vector node, an array or an object; Jacobians come back as rows', () => {
  const compiled = compile({ X: 'x * cos(y)', Y: 'x * sin(y)', Z: 'x' }, { variables: ['x', 'y'] });
  const expected = compiled.evaluate({ x: 2, y: 0.5 });
  for (const inputs of [{ x: 2, y: 0.5 }, [2, 0.5]]) {
    const { value, jacobian } = compiled.tsl(NUMERIC_TSL, { inputs });
    assert.deepEqual(value.components, expected.value);
    assert.deepEqual(jacobian, expected.jacobian);
  }
  const single = compile('u * u', { variables: ['u'] }).tsl(NUMERIC_TSL, { inputs: 3 });
  assert.deepEqual([single.value, single.gradient], [9, 6]);
});

test('each graph node becomes one TSL node, so shared subexpressions stay shared', () => {
  const calls = [];
  const recording = new Proxy({}, {
    get: (_, name) => (...args) => {
      calls.push(name);
      return { name, args };
    },
  });
  const program = createProgram({ variables: ['x', 'y'] });
  const shared = program.expression('sin(x * y)');
  const spec = { name: 'f', returns: { type: 'float', components: [program.add(shared, program.mul(shared, shared))] } };
  program.tsl(spec, recording, { inputs: { x: 'X', y: 'Y' } });
  assert.deepEqual(calls.filter((name) => name === 'sin').length, 1);
});

test('missing TSL inputs and parameters are reported', () => {
  const compiled = compile('x * a', { variables: ['x'], parameters: ['a'] });
  assert.throws(() => compiled.tsl(NUMERIC_TSL, { parameters: { a: 1 } }), /no TSL input for variable 'x'/);
  assert.throws(() => compiled.tsl(NUMERIC_TSL, { inputs: 1 }), /no TSL node for parameter 'a'/);
});
