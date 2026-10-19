import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionError } from '../src/index.js';
import { inEditor, readSource } from '../examples/shared/editor.js';
import { compileSurface, PRESETS, surfaceNodes } from '../examples/tsl/surface.js';

/** A numeric stand-in for `three/tsl` with vectors (arrays with x/y/z) and column-major matrices. */
const vector = (components) => Object.assign(components, { x: components[0], y: components[1], z: components[2] });
const lift = (f) => (a, b) => {
  if (a?.matrix && Array.isArray(b)) return vector([0, 1, 2].map((row) => b.reduce((sum, value, j) => sum + a.matrix[j * 3 + row] * value, 0)));
  if (Array.isArray(a) || Array.isArray(b)) {
    const size = Array.isArray(a) ? a.length : b.length;
    return vector(Array.from({ length: size }, (_, i) => f(Array.isArray(a) ? a[i] : a, Array.isArray(b) ? b[i] : b)));
  }
  return f(a, b);
};
const VECTOR_TSL = {
  float: (value) => value,
  add: lift((a, b) => a + b),
  sub: lift((a, b) => a - b),
  mul: lift((a, b) => a * b),
  div: lift((a, b) => a / b),
  negate: (a) => (Array.isArray(a) ? vector(a.map((value) => -value)) : -a),
  lessThan: (a, b) => a < b,
  select: (condition, a, b) => (condition ? a : b),
  atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
  vec2: (...components) => vector(components),
  vec3: (...components) => vector(components),
  mat3: (...components) => ({ matrix: components }),
  cross: (a, b) => vector([a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x]),
  normalize: (a) => vector(a.map((value) => value / Math.hypot(...a))),
  ...Object.fromEntries(['sin', 'cos', 'tan', 'asin', 'acos', 'exp', 'log', 'sqrt', 'abs', 'sign', 'floor', 'min', 'max', 'pow']
    .map((name) => [name, Math[name]])),
};

test('editor text splits into definitions and a final expression with offsets', () => {
  const text = 'r = sqrt(x^2) // radius\n\n  k = 2*r\nk + y';
  const read = readSource(text);
  assert.deepEqual(read.definitions, { r: 'sqrt(x^2) ', k: '2*r' });
  assert.equal(text.slice(read.offsets.r, read.offsets.r + 4), 'sqrt');
  assert.equal(text.slice(read.offsets.k, read.offsets.k + 3), '2*r');
  assert.equal(read.expression, 'k + y');
  assert.equal(read.expressionOffset, text.indexOf('k + y'));
  assert.equal(readSource('X = x\nY = y').expression, null);
});

test('editor text errors: lines after the expression, definitions repeated', () => {
  assert.throws(() => readSource('x + 1\nr = 2'), (error) => error instanceof ExpressionError && error.start === 0 && error.end === 5);
  assert.throws(() => readSource('r = 1\n r = 2\nr'), (error) => error.reason === "'r' is defined twice" && error.start === 7);
});

test('compile errors are moved to their place in the editor text', () => {
  const text = 'r = sqrt(x^2 +)\nr';
  const read = readSource(text);
  const located = (source) => {
    try {
      inEditor(read, () => { throw new ExpressionError('boom', { start: 2, end: 3, source }); });
    } catch (error) {
      return error;
    }
  };
  assert.equal(located('derived.r').start, read.offsets.r + 2);
  assert.equal(located('expression').start, read.expressionOffset + 2);
  assert.equal(located('derived.constructor').source, 'derived.constructor');
  assert.equal(located('derived.constructor').start, 2);
  const surface = (() => {
    try {
      return compileSurface(text);
    } catch (error) {
      return error;
    }
  })();
  assert.ok(surface instanceof ExpressionError);
  assert.equal(text.slice(surface.start, surface.end), ')');
});

test('every TSL example preset compiles, as a height field or a warp', () => {
  for (const [name, text] of Object.entries(PRESETS)) {
    const surface = compileSurface(text);
    assert.equal(surface.mode, /X = /.test(text) ? 'warp' : 'height', name);
    if (surface.mode === 'warp') assert.equal(surface.base, /base: (\w+)/.exec(text)[1], name);
  }
  assert.equal(compileSurface('X = x\nY = y\nZ = z').base, 'sphere');
  assert.throws(() => compileSurface('X = x\nY = y'), /Z missing/);
  assert.throws(() => compileSurface('r = x'), /end with an expression/);
});

test('exact surface normals match central differences of the value', () => {
  const parameters = { t: 0.7, a: 0.6, b: 0.4 };
  for (const [name, text] of Object.entries(PRESETS)) {
    const surface = compileSurface(text);
    for (const [x, y, z] of [[0.31, -0.2, 0.45], [-0.6, 0.35, 0.12], [0.8, 0.1, -0.7]]) {
      const position = vector([x, surface.mode === 'height' ? 0 : y, z]);
      const normal = vector(surface.mode === 'height' ? [0, 1, 0] : [0.6, 0, 0.8]);
      const exact = surfaceNodes(surface, VECTOR_TSL, { position, normal, parameters });
      const finite = surfaceNodes(surface, VECTOR_TSL, { position, normal, parameters, epsilon: 1e-5 });
      if (surface.mode === 'height') {
        assert.equal(exact.position[1], surface.exact.evaluate({ x, z, ...parameters }).value, name);
      } else {
        assert.deepEqual([...exact.position], surface.exact.evaluate({ x, y, z, ...parameters }).value, name);
      }
      exact.normal.forEach((value, i) => assert.ok(Math.abs(value - finite.normal[i]) < 1e-7, `${name} normal ${i}: ${value} vs ${finite.normal[i]}`));
      assert.ok(Math.abs(Math.hypot(...exact.normal) - 1) < 1e-12, name);
    }
  }
});

test('the warp normal stays perpendicular to the warped surface', () => {
  const surface = compileSurface(PRESETS['Twisted box']);
  const parameters = { t: 1.3, a: 0.8, b: 0.5 };
  const normal = vector([0, 0, 1]);
  const at = (x, y) => surfaceNodes(surface, VECTOR_TSL, { position: vector([x, y, 0.5]), normal, parameters });
  const { position, normal: warped } = at(0.2, 0.3);
  const h = 1e-5;
  const tangents = [
    VECTOR_TSL.sub(at(0.2 + h, 0.3).position, at(0.2 - h, 0.3).position),
    VECTOR_TSL.sub(at(0.2, 0.3 + h).position, at(0.2, 0.3 - h).position),
  ];
  assert.ok(Math.hypot(...position) > 0);
  for (const tangent of tangents) {
    const dot = tangent.reduce((sum, value, i) => sum + value * warped[i], 0) / Math.hypot(...tangent);
    assert.ok(Math.abs(dot) < 1e-8, `tangent · normal = ${dot}`);
  }
});
