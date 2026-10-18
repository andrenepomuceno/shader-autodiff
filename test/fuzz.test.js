import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, ExpressionError } from '../src/index.js';

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const TOKENS = ['x', 'y', 'a', 'pi', 'E', '1', '0', '2.5', '1e3', '.5', '+', '-', '*', '/', '^', '**', '(', ')', ',',
  'sin(', 'pow(', 'atan2(', 'min(', 'mod(', 'log(', 'sqrt(', 'abs(', 'floor(', 'q', '$', ' ', '1e400', 'constructor', '__proto__'];

/** Every input either compiles to code that runs, or throws an ExpressionError; nothing else. */
function check(text) {
  let compiled;
  try {
    compiled = compile(text, { variables: ['x', 'y'], parameters: ['a'], order: 2 });
  } catch (error) {
    assert.ok(error instanceof ExpressionError, `${JSON.stringify(text)} threw ${error}`);
    assert.ok(error.start >= 0 && error.end >= error.start && error.end <= Math.max(text.length, 4000), `span of ${JSON.stringify(text)}`);
    return;
  }
  compiled.glsl('f');
  compiled.wgsl('f');
  const emitted = new Function(`return ${compiled.js('f')}`)();
  const env = { x: 0.7, y: -1.3, a: 2 };
  assert.deepEqual(emitted(env), compiled.evaluate(env), text);
}

test('random token soup never crashes the compiler', () => {
  const next = random(99);
  for (let index = 0; index < 3000; index += 1) {
    const length = 1 + Math.floor(next() * 12);
    check(Array.from({ length }, () => TOKENS[Math.floor(next() * TOKENS.length)]).join(''));
  }
});

test('random characters never crash the parser', () => {
  const next = random(5);
  const alphabet = 'xy a0123456789.eE+-*/^(),_ \t\n!@#';
  for (let index = 0; index < 2000; index += 1) {
    const length = Math.floor(next() * 20);
    check(Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join(''));
  }
});

test('adversarial inputs stay within limits', () => {
  for (const text of [
    '('.repeat(5000),
    'sin('.repeat(1000) + 'x' + ')'.repeat(1000),
    '-'.repeat(3000) + 'x',
    'x' + '^x'.repeat(500),
    'x' + '+x'.repeat(1999),
    Array(1500).fill('x*y').join('+'),
    '9'.repeat(400),
    '\u0000x',
    'x−y',
  ]) {
    check(text);
  }
});

test('deep but legal expressions compile without exhausting the stack', () => {
  const nested = 'sin('.repeat(30) + 'x' + ')'.repeat(30);
  const compiled = compile(nested, { variables: ['x'], order: 2 });
  assert.equal(compiled.evaluate({ x: 0.5 }).value, Array.from({ length: 30 }).reduce((value) => Math.sin(value), 0.5));
  const long = compile(Array(300).fill('x').join(' * 1.001 + '), { variables: ['x'] });
  assert.ok(Number.isFinite(long.evaluate({ x: 1 }).value));
});

test('expressions at the node limit with Hessians compile quickly', () => {
  const next = random(11);
  const terms = Array.from({ length: 140 }, () => `sin(${'xyz'[Math.floor(next() * 3)]} * ${(next() * 3).toFixed(2)} + y*z)`);
  const text = terms.join(' * 0.5 + ');
  const start = performance.now();
  const compiled = compile(text, { variables: ['x', 'y', 'z'], order: 2 });
  compiled.glsl('f');
  compiled.wgsl('f');
  assert.ok(performance.now() - start < 2000, `took ${performance.now() - start} ms`);
});
