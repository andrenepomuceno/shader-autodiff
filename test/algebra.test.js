import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, createProgram } from '../src/index.js';

const VARIABLES = { variables: ['x', 'y', 'z'], parameters: ['a'] };
const body = (text) => compile(text, { ...VARIABLES, order: 0 }).glsl('f').split('\n').slice(1, -2).join('\n');
const returned = (text) => /return (.*);/.exec(body(text))[1];

test('identities cancel to constants', () => {
  for (const [text, value] of [
    ['x*y - y*x', '0.0'],
    ['x/x + y/y', '2.0'],
    ['sin(a*x)^2 + cos(a*x)^2', '1.0'],
    ['3*sin(x)^2*y + 3*y*cos(x)^2 - 3*y', '0.0'],
    ['(x + y)*(x + y) - (y + x)^2', '0.0'],
    ['(x - y)/(y - x)', '-1.0'],
    ['2*(x + 1) - 2*x', '2.0'],
  ]) {
    assert.equal(returned(text), value, text);
  }
});

test('square roots squared give their argument', () => {
  assert.equal(returned('sqrt(x*x + y*y)^2'), 'p.x * p.x + p.y * p.y');
  assert.equal(returned('sqrt(x)^3 / x'), 'sqrt(p.x)');
});

test('scalar multiples and opposite signs of a sum share one node', () => {
  const program = createProgram(VARIABLES);
  const graph = program.expression('(2*x + 2*y)*z + (x + y)*a - (-x - y)');
  const glsl = program.glsl({ name: 'f', returns: { type: 'float', components: [graph] } });
  assert.equal((glsl.match(/p\.x \+ p\.y/g) ?? []).length, 1, glsl);
});

test('products of sums are not expanded', () => {
  const glsl = body('(x + y + z)*(x - y + a)*(y + z + a)');
  assert.equal((glsl.match(/\*/g) ?? []).length, 2, glsl);
});

test('the twist pullback has an identically zero dg/dy, like sympy finds', async () => {
  const { compileMetric } = await import('../examples/metric-shaders/metric.js');
  const { glsl } = compileMetric({ kind: 'pullback', components: { X: 'x*cos(a*y) + z*sin(a*y)', Y: 'y', Z: 'z*cos(a*y) - x*sin(a*y)' } });
  assert.match(glsl, /dgdy = mat3\(0\.0, 0\.0, 0\.0, 0\.0, 0\.0, 0\.0, 0\.0, 0\.0, 0\.0\);/);
});

test('coefficients never fold outside the float32 range', () => {
  const big = compile('(1e20*x)*(1e20*y) + (1e20*x)*(y*1e20)', { variables: ['x', 'y'] });
  assert.doesNotThrow(() => big.glsl('f'));
  assert.equal(big.evaluate({ x: 1e-20, y: 1e-20 }).value, 2);
  assert.equal(compile('(1e20*x)*(1e20*y) - (1e20*x)*(y*1e20)', { variables: ['x', 'y'] }).evaluate({ x: 3, y: 4 }).value, 0);
});
