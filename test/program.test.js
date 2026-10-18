import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgram, ExpressionError } from '../src/index.js';

const options = { variables: ['x', 'y', 'z'], parameters: ['s'], derived: { r: 'sqrt(x*x + y*y + z*z)' } };

test('expressions share one graph and combine arithmetically', () => {
  const program = createProgram(options);
  const a = program.expression('r * x');
  const b = program.expression('x * r');
  assert.equal(a, b);
  const sum = program.add(a, program.mul(program.constant(2), program.expression('s')));
  assert.deepEqual(program.evaluate([sum], { x: 3, y: 4, z: 0, s: 1 }), [17]);
  assert.throws(() => program.add(a, 1e9), /invalid expression handle/);
  assert.throws(() => program.add(a, 0.5), /invalid expression handle/);
});

test('derivatives nest to any order and zero is a constant', () => {
  const program = createProgram(options);
  const f = program.expression('x^3 * y');
  const fxx = program.derivative(program.derivative(f, 'x'), 'x');
  const fxxy = program.derivative(fxx, 'y');
  assert.deepEqual(program.evaluate([fxx, fxxy], { x: 2, y: 5, z: 0, s: 0 }), [60, 12]);
  assert.ok(program.isZero(program.derivative(f, 'z')));
  assert.ok(program.isZero(program.derivative(fxxy, 'y')));
  assert.throws(() => program.derivative(f, 's'), /'s' is not a variable/);
});

test('custom function specs: matrix return, mixed outputs, renamed parameters', () => {
  const program = createProgram(options);
  const [xx, xy, yy] = ['1 + s*x*x', 's*x*y', '1 + s*y*y'].map((text) => program.expression(text));
  const spec = {
    name: 'metric',
    returns: { type: 'mat2', components: [xx, xy, xy, yy] },
    outputs: [{ name: 'trace', type: 'float', components: [program.add(xx, yy)] }],
    parameters: { s: 'u_morph' },
  };
  assert.equal(program.glsl(spec), [
    'mat2 metric(vec3 p, out float trace) {',
    '    float t0 = p.x * u_morph;',
    '    float t1 = 1.0 + p.x * t0;',
    '    float t2 = p.y * t0;',
    '    float t3 = 1.0 + p.y * (p.y * u_morph);',
    '    trace = t1 + t3;',
    '    return mat2(t1, t2, t2, t3);',
    '}',
    '',
  ].join('\n'));
  assert.match(program.wgsl(spec), /^fn metric\(p: vec3<f32>, trace: ptr<function, f32>\) -> mat2x2<f32> \{/);
  const env = { x: 1, y: 2, z: 0, s: 0.5 };
  assert.deepEqual(program.evaluateFunction(spec, env), { value: [[1.5, 1], [1, 3]], trace: 4.5 });
  const emitted = new Function(`return ${program.js(spec)}`)();
  assert.deepEqual(emitted(env), program.evaluateFunction(spec, env));
});

test('non-square matrices are column-major in shaders and row-indexed in JS', () => {
  const program = createProgram({ variables: ['x', 'y'] });
  const [a, b, c, d, e, f] = ['1', '2', '3', '4', '5', '6'].map((text) => program.expression(`${text} * x`));
  const spec = { name: 'm', returns: { type: 'mat2x3', components: [a, b, c, d, e, f] } };
  assert.match(program.glsl(spec), /return mat2x3\(p\.x, 2\.0 \* p\.x, 3\.0 \* p\.x, 4\.0 \* p\.x, 5\.0 \* p\.x, 6\.0 \* p\.x\);/);
  assert.deepEqual(program.evaluateFunction(spec, { x: 1, y: 0 }).value, [[1, 4], [2, 5], [3, 6]]);
});

test('the program keeps its own copy of the variable and parameter lists', () => {
  const variables = ['x'];
  const program = createProgram({ variables, parameters: ['a'] });
  const f = program.expression('a * x');
  variables.push('a');
  assert.throws(() => program.derivative(f, 'a'), /'a' is not a variable/);
  assert.deepEqual(program.variables, ['x']);
  assert.ok(Object.isFrozen(program.variables));
  assert.match(program.glsl({ name: 'f', returns: { type: 'float', components: [f] } }), /^float f\(float x\)/);
});

test('spec validation', () => {
  const program = createProgram(options);
  const x = program.expression('x');
  assert.throws(() => program.glsl({ name: 'f', returns: { type: 'vec3', components: [x] } }), /'vec3' needs 3 components, got 1/);
  assert.throws(() => program.glsl({ name: 'f', returns: { type: 'vec5', components: [x] } }), /unsupported type 'vec5'/);
  assert.throws(() => program.glsl({ name: 'f', returns: { type: 'float[1]', components: [x] } }), /cannot return an array/);
  assert.throws(() => program.glsl({ name: 'f', outputs: [{ name: 'value', type: 'float', components: [x] }], returns: { type: 'float', components: [x] } }), /'value' collides/);
  assert.throws(() => program.glsl({ name: 'f', outputs: [{ name: 'o', type: 'float', components: [x] }, { name: 'o', type: 'float', components: [x] }] }), /'o' collides/);
  assert.throws(() => program.glsl({ name: 'f', outputs: [{ name: 'exp', type: 'float', components: [x] }] }), /output 'exp' shadows a built-in/);
  assert.equal(program.glsl({ name: 'f', outputs: [{ name: 'o', type: 'float[2]', components: [x, x] }] }),
    'void f(vec3 p, out float o[2]) {\n    o[0] = p.x;\n    o[1] = p.x;\n}\n');
});

test('a failing derived symbol can be retried without a false cycle error', () => {
  const program = createProgram({ variables: ['x'], derived: { q: 'x + w', u: 'q * 2' } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(() => program.expression('u'), (error) => error instanceof ExpressionError && /unknown symbol 'w'/.test(error.reason));
  }
});
