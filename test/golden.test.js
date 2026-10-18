import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { glslFloat } from '../src/targets.js';
import { golden } from './helpers/golden.js';

const METRIC = {
  variables: ['x', 'y', 'z'],
  parameters: ['a', 'b', 'c', 'd', 't'],
  derived: { r: 'sqrt(x*x + y*y + z*z)' },
};
const UNIFORMS = { parameters: { a: 'u_params.x', b: 'u_params.y', c: 'u_params.z', d: 'u_params.w', t: 'u_time' } };

const CASES = {
  'schwarzschild-lens': ['(1 + a/(2*sqrt(r^2 + b^2)))^4', METRIC],
  'gaussian-lens': ['1 + a*exp(-r^2/(b*b))', METRIC],
  ripple: ['1 + a*sin(b*r - c*t)/(1 + r)', METRIC],
  'piecewise': ['abs(x) + min(x, y) * max(y, z) + floor(z) + mod(x, 2) + sign(y) * z', METRIC],
  'one-variable': ['x^3 - 2*x + atan2(1, x)', { variables: ['x'] }],
  'five-variables': ['u*v + w*sinh(s) - q^2', { variables: ['u', 'v', 'w', 's', 'q'] }],
  'value-only': ['sqrt(x*x + y*y) - 1', { variables: ['x', 'y'], order: 0 }],
  hessian: ['x*x*y + sin(y)', { variables: ['x', 'y'], order: 2 }],
  'hessian-one-variable': ['exp(x) * x', { variables: ['x'], order: 2 }],
  jacobian: [{ X: 'x*cos(y)', Y: 'x*sin(y)', Z: 'a*x' }, { variables: ['x', 'y'], parameters: ['a'] }],
  'jacobian-five': [{ A: 'u*v', B: 'w + s*q' }, { variables: ['u', 'v', 'w', 's', 'q'] }],
};

for (const [name, [text, options]] of Object.entries(CASES)) {
  test(`golden ${name}`, () => {
    const compiled = compile(text, options);
    golden(`${name}.glsl`, compiled.glsl('f', UNIFORMS));
    golden(`${name}.wgsl`, compiled.wgsl('f', UNIFORMS));
    golden(`${name}.js`, compiled.js('f'));
  });
}

test('GLSL float literals always have a dot', () => {
  assert.equal(glslFloat(2), '2.0');
  assert.equal(glslFloat(-3), '-3.0');
  assert.equal(glslFloat(0.25), '0.25');
  assert.equal(glslFloat(1e21), '1.0e+21');
  assert.equal(glslFloat(1e-7), '1.0e-7');
  assert.equal(glslFloat(1.5e-7), '1.5e-7');
});

test('emission is deterministic', () => {
  const [text, options] = CASES.ripple;
  assert.equal(compile(text, options).glsl('f'), compile(text, options).glsl('f'));
});
