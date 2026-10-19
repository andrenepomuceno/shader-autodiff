import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionError } from '../src/index.js';
import { inEditor, readSource } from '../examples/shared/editor.js';

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
});
