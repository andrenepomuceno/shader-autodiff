import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, ExpressionError } from '../src/index.js';

function rejects(text, options, reason, details = {}) {
  assert.throws(() => compile(text, options), (error) => {
    assert.ok(error instanceof ExpressionError, error.message);
    assert.match(error.reason, reason);
    for (const [key, value] of Object.entries(details)) assert.equal(error[key], value, key);
    return true;
  });
}

const XYZ = { variables: ['x', 'y', 'z'] };

test('unknown symbols and functions are reported with their span', () => {
  rejects('x + foo', XYZ, /unknown symbol 'foo'/, { start: 4, end: 7 });
  rejects('bar(x)', XYZ, /unknown function 'bar'/, { start: 0, end: 3 });
  rejects('sin + x', XYZ, /'sin' is a function/, { start: 0 });
  rejects('constructor + x', XYZ, /unknown symbol 'constructor'/);
  rejects('toString(x)', XYZ, /unknown function 'toString'/);
});

test('arity is checked', () => {
  rejects('sin(x, y)', XYZ, /'sin' takes 1 argument, got 2/, { start: 0, end: 9 });
  rejects('atan2(x)', XYZ, /'atan2' takes 2 arguments, got 1/);
});

test('constant exponents are bounded, which rules out power towers', () => {
  rejects('x^33', XYZ, /exponent 33 exceeds 32/, { start: 2, end: 4 });
  rejects('2^2^2^2^2', XYZ, /exponent 65536 exceeds 32/);
  rejects('pow(x, -40)', XYZ, /exponent -40 exceeds 32/);
  rejects('x^3', { ...XYZ, limits: { maxExponent: 2 } }, /exponent 3 exceeds 2/);
  assert.doesNotThrow(() => compile('x^32 + y^-32 + 2^x^2', XYZ));
});

test('constant folding rejects non-finite constants', () => {
  rejects('x + log(0)', XYZ, /-Infinity/, { start: 4, end: 10 });
  rejects('x * sqrt(-1)', XYZ, /NaN/);
  rejects('1 / (2 - 2)', XYZ, /Infinity/);
});

test('constants fold, including pi and E', () => {
  const compiled = compile('2 * pi + E^2 + 3^2', { order: 0 });
  assert.equal(compiled.evaluate({}).value, 2 * Math.PI + Math.E ** 2 + 9);
  assert.equal(compiled.glsl('c'), `float c() {\n    return ${2 * Math.PI + Math.E ** 2 + 9};\n}\n`);
});

test('derived symbols: errors point into the derived source, cycles are rejected', () => {
  rejects('r', { ...XYZ, derived: { r: 'sqrt(x*x + w)' } }, /unknown symbol 'w'/, { source: 'derived.r', start: 11 });
  rejects('r', { ...XYZ, derived: { r: 's', s: 'r + 1' } }, /'r' refers to itself/);
  assert.doesNotThrow(() => compile('x', { ...XYZ, derived: { unused: 'nonsense(' } }));
});

test('declared names are validated', () => {
  assert.throws(() => compile('x', { variables: ['x', 'x'] }), /declared twice/);
  assert.throws(() => compile('x', { variables: ['x'], parameters: ['sin'] }), /shadows a built-in/);
  assert.throws(() => compile('x', { variables: ['x'], parameters: ['pi'] }), /shadows a built-in/);
  assert.throws(() => compile('x', { variables: ['1x'] }), /invalid symbol name/);
  assert.throws(() => compile('x', { variables: ['x'], parameters: ['t0'] }), /reserved/);
  assert.throws(() => compile('x', { variables: ['x'], parameters: ['float'] }), /reserved/);
  assert.throws(() => compile('x', { variables: ['x'], parameters: ['new'] }), /reserved/);
});

test('unsupported orders and shapes are rejected', () => {
  assert.throws(() => compile('x', { variables: ['x'], order: 3 }), /order 3 is not supported/);
  assert.throws(() => compile({ X: 'x', Y: 'y' }, { variables: ['x', 'y'], order: 2 }), /needs a single expression/);
  assert.throws(() => compile({}, { variables: ['x'] }), /no expressions/);
  assert.throws(() => compile({ 'not valid': 'x' }, { variables: ['x'] }), /invalid output name/);
});

test('errors in a named expression carry its name as source', () => {
  rejects({ X: 'x', Y: 'y +' }, { variables: ['x', 'y'] }, /unexpected end/, { source: 'Y', start: 3 });
});

test('emitted names may not collide', () => {
  const compiled = compile('gradient * x', { variables: ['x'], parameters: ['gradient'] });
  assert.throws(() => compiled.glsl('f'), /output name 'gradient' collides/);
  assert.doesNotThrow(() => compiled.glsl('f', { parameters: { gradient: 'u_gradient' } }));
  const packed = compile('p * x + y', { variables: ['x', 'y'], parameters: ['p'] });
  assert.throws(() => packed.glsl('f'), /collides/);
  assert.doesNotThrow(() => packed.js('f'));
  assert.throws(() => compile('x', { variables: ['x'] }).glsl('x'), /function name 'x' collides/);
  assert.throws(() => compile('x', { variables: ['x'] }).glsl('fn'), /function 'fn' is reserved/);
  assert.throws(() => compile('x', { variables: ['x'] }).glsl('1f'), /invalid function name/);
});

test('JS output names are object keys and never collide with symbols', () => {
  const compiled = compile('x * gradient + value', { variables: ['x', 'y'], parameters: ['gradient', 'value'] });
  const emitted = new Function(`return ${compiled.js('f')}`)();
  assert.deepEqual(emitted({ x: 2, y: 0, gradient: 3, value: 1 }), { value: 7, gradient: [3, 0] });
});

test('names reserved in any target or shadowing a shader built-in are rejected', () => {
  for (const name of ['target', 'set', 'from', 'ref', 'match', '_', 'mix', 'length', 'dot', 'fract']) {
    assert.throws(() => compile('1', { variables: [name] }), /reserved|shadows a built-in/, name);
  }
  assert.throws(() => compile('x + 1', { variables: ['x'] }).glsl('sqrt'), /function 'sqrt' shadows a built-in/);
  assert.throws(() => compile('x + 1', { variables: ['x'] }).wgsl('length'), /function 'length' is reserved/);
});

test('constants outside the float32 range are rejected in shaders but fine in JS', () => {
  const compiled = compile('x * 1e39 + exp(100)', { variables: ['x'] });
  assert.throws(() => compiled.glsl('f'), /does not fit in a 32-bit float/);
  assert.throws(() => compiled.wgsl('f'), /does not fit in a 32-bit float/);
  assert.equal(compiled.evaluate({ x: 0 }).value, Math.exp(100));
  assert.doesNotThrow(() => compiled.js('f'));
});

test('without variables the derivative outputs are empty', () => {
  const single = compile('2 * a', { parameters: ['a'], order: 2 });
  assert.deepEqual(single.evaluate({ a: 3 }), { value: 6, gradient: [], hessian: [] });
  assert.equal(single.glsl('f'), 'float f() {\n    return 2.0 * a;\n}\n');
  assert.deepEqual(new Function(`return ${single.js('f')}`)()({ a: 3 }), { value: 6, gradient: [], hessian: [] });
  const multiple = compile({ U: 'a', V: '1' }, { parameters: ['a'] });
  assert.deepEqual(multiple.evaluate({ a: 3 }), { value: [3, 1], jacobian: [[], []] });
  assert.equal(multiple.glsl('f'), 'void f(out vec2 value) {\n    value = vec2(a, 1.0);\n}\n');
});

test('evaluate requires every symbol it reads', () => {
  const compiled = compile('x * a', { variables: ['x'], parameters: ['a'] });
  assert.throws(() => compiled.evaluate({ x: 1 }), /missing numeric value for 'a'/);
});

test('structurally equal subexpressions are shared', () => {
  const glsl = compile('sin(x*y) + sin(y*x) + sin(x*y)^2', { variables: ['x', 'y'], order: 0 }).glsl('f');
  assert.equal(glsl.match(/sin\(/g).length, 1);
});
