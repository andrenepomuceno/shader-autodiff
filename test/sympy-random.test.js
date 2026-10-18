import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../src/index.js';

const VARIABLES = ['x', 'y', 'z'];
const PARAMETERS = ['a', 'b'];
const TOLERANCE = 1e-9;
const CHUNK = 20;

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sympy-random.json', import.meta.url), 'utf8'));

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / (1 + Math.abs(expected));
}

function assertEntry(actual, expected, message) {
  const error = relativeError(actual, expected);
  assert.ok(error < TOLERANCE, `${message}: ${actual} vs ${expected} (error ${error})`);
}

function checkCase({ text, samples }) {
  const compiled = compile(text, { variables: VARIABLES, parameters: PARAMETERS, order: 2 });
  for (const { env, value, gradient, hessian } of samples) {
    const where = `${text} at ${JSON.stringify(env)}`;
    const result = compiled.evaluate(env);
    assertEntry(result.value, value, `value of ${where}`);
    VARIABLES.forEach((name, i) => {
      assertEntry(result.gradient[i], gradient[i], `d/d${name} of ${where}`);
      VARIABLES.forEach((other, j) => {
        assertEntry(result.hessian[i][j], hessian[i][j], `d2/d${name}d${other} of ${where}`);
      });
    });
  }
}

test('the fixture is non-trivial', () => {
  assert.ok(fixture.cases.length >= 100);
});

for (let start = 0; start < fixture.cases.length; start += CHUNK) {
  const chunk = fixture.cases.slice(start, start + CHUNK);
  test(`value, gradient and Hessian match sympy on random expressions ${start}-${start + chunk.length - 1}`, () => {
    chunk.forEach(checkCase);
  });
}
