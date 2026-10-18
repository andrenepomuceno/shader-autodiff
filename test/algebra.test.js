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

test('merged coefficients stay ordinary float32 in sums, distributions and quotients', () => {
  for (const text of ['3e38*x + 3e38*x', '1e30*(x+y)*1e30', '(x+y)/3e38', 'x/3e38 + y/3e38']) {
    const glsl = compile(text, { variables: ['x', 'y'], order: 0 }).glsl('f');
    for (const literal of glsl.match(/\d[\d.]*e[+-]?\d+/g) ?? []) {
      const value = Math.abs(Number(literal));
      assert.ok(value >= 1.1754943508222875e-38 && value <= 3.4028234663852886e38, `${text} emitted ${literal}`);
    }
  }
});

test('division by a constant stays a division unless the reciprocal is exact', () => {
  const compiled = compile('x/49', { variables: ['x'], order: 0 });
  assert.equal(compiled.evaluate({ x: 49 }).value, 1);
  assert.match(compiled.glsl('f'), /p?x \/ 49\.0/);
  assert.match(compile('x/4', { variables: ['x'], order: 0 }).glsl('f'), /0\.25 \* x/);
  assert.equal(compile('(x + y)/3', { variables: ['x', 'y'], order: 0 }).evaluate({ x: 1, y: 2 }).value, 1);
});

test('dividing by an expression that cancels to zero is an ExpressionError', async () => {
  const { ExpressionError } = await import('../src/index.js');
  assert.throws(() => compile('x/(sin(x)^2 + cos(x)^2 - 1)', { variables: ['x', 'y'] }), (error) =>
    error instanceof ExpressionError && /identically zero/.test(error.reason) && error.end > error.start);
});

test('a sum and its negation share one node regardless of other factors', () => {
  const program = createProgram({ variables: ['u', 'v', 'w', 's', 'q'], parameters: ['g'] });
  const plain = program.expression('v - u');
  const scaled = program.expression('g*u - g*v');
  const glsl = program.glsl({ name: 'k', outputs: [{ name: 'o', type: 'float[2]', components: [plain, scaled] }] });
  assert.equal((glsl.match(/u - v|v - u/g) ?? []).length, 1, glsl);
});

test('long sums grow the graph linearly', () => {
  const nodes = (count) => createProgram({ variables: ['x'] })
    .expression(Array.from({ length: count }, (_, k) => `sin(${k + 1}*x)`).join(' + '));
  assert.ok(nodes(200) < 8 * 200, `200 terms made ${nodes(200)} nodes`);
  assert.ok(nodes(200) / nodes(50) < 5, `${nodes(50)} nodes for 50 terms, ${nodes(200)} for 200`);
});

test('sin² alone does not create cos nodes', () => {
  const program = createProgram({ variables: ['x', 'y'] });
  const handle = program.expression('sin(x)^2 + y');
  const glsl = program.glsl({ name: 'f', returns: { type: 'float', components: [handle] } });
  assert.doesNotMatch(glsl, /cos/);
  const ids = program.expression('cos(x)');
  assert.ok(ids > handle, 'cos(x) is created only when asked for');
});
