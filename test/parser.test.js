import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { ExpressionError } from '../src/errors.js';

function show(node) {
  switch (node.type) {
    case 'number': return String(node.value);
    case 'name': return node.name;
    case 'call': return `${node.name}(${node.args.map(show).join(', ')})`;
    case 'unary': return `(-${show(node.arg)})`;
    case 'binary': return `(${show(node.left)} ${node.op} ${show(node.right)})`;
  }
}

function rejects(text, reason, start, limits) {
  assert.throws(() => parse(text, { limits }), (error) => {
    assert.ok(error instanceof ExpressionError);
    assert.match(error.reason, reason);
    if (start !== undefined) assert.equal(error.start, start);
    return true;
  });
}

test('precedence and associativity', () => {
  assert.equal(show(parse('1 + 2 * 3')), '(1 add (2 mul 3))');
  assert.equal(show(parse('a - b - c')), '((a sub b) sub c)');
  assert.equal(show(parse('a / b / c')), '((a div b) div c)');
  assert.equal(show(parse('a ^ b ^ c')), '(a pow (b pow c))');
  assert.equal(show(parse('a ** 2')), '(a pow 2)');
});

test('unary minus binds looser than power and tighter than products', () => {
  assert.equal(show(parse('-x^2')), '(-(x pow 2))');
  assert.equal(show(parse('-2*x')), '((-2) mul x)');
  assert.equal(show(parse('2^-x')), '(2 pow (-x))');
  assert.equal(show(parse('+x')), 'x');
  assert.equal(show(parse('--x')), '(-(-x))');
});

test('numbers, names and calls', () => {
  assert.equal(show(parse('.5 + 1. + 2e-3 + 1.5E+2')), '(((0.5 add 1) add 0.002) add 150)');
  assert.equal(show(parse('atan2(y, x) + sin(cos(t))')), '(atan2(y, x) add sin(cos(t)))');
  assert.equal(show(parse('f()')), 'f()');
  assert.equal(show(parse(' ( ( x ) ) ')), 'x');
});

test('nodes carry source spans', () => {
  const tree = parse('a + sin(b)');
  assert.deepEqual([tree.right.start, tree.right.end], [4, 10]);
  assert.deepEqual([tree.right.args[0].start, tree.right.args[0].end], [8, 9]);
  const grouped = parse('(a + b) * c');
  assert.deepEqual([grouped.left.start, grouped.left.end], [0, 7]);
});

test('syntax errors carry positions', () => {
  rejects('', /empty/, 0);
  rejects('1 +', /unexpected end/, 3);
  rejects('(x + 1', /expected '\)'/, 6);
  rejects('x + 1)', /unexpected '\)'/, 5);
  rejects('x $ y', /unexpected character '\$'/, 2);
  rejects('x y', /unexpected 'y'/, 2);
  rejects('sin(x,)', /unexpected '\)'/, 6);
  rejects('1e999', /out of range/, 0);
  rejects('x = 1', /unexpected character '='/, 2);
});

test('limits on length, depth and node count', () => {
  rejects('x+'.repeat(20) + 'x', /longer than 10/, 10, { maxLength: 10 });
  rejects('('.repeat(100) + 'x' + ')'.repeat(100), /nested deeper/, undefined);
  rejects('-'.repeat(100) + 'x', /nested deeper/, undefined);
  rejects(Array(30).fill('x').join('+'), /more than 20 nodes/, undefined, { maxNodes: 20 });
  assert.doesNotThrow(() => parse(Array(500).fill('x').join('+')));
});

test('rejects non-strings', () => {
  assert.throws(() => parse(42), ExpressionError);
});
