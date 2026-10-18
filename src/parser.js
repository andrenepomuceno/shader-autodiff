import { ExpressionError } from './errors.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxLength: 4000,
  maxDepth: 64,
  maxNodes: 2000,
  maxExponent: 32,
});

const NUMBER = /\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?/y;
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/y;
const WHITESPACE = /\s+/y;

const INFIX = {
  '+': { power: 10, op: 'add' },
  '-': { power: 10, op: 'sub' },
  '*': { power: 20, op: 'mul' },
  '/': { power: 20, op: 'div' },
  '^': { power: 40, op: 'pow', rightAssociative: true },
};
const PREFIX_POWER = 30;

function matchAt(pattern, text, index) {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match ? match[0] : null;
}

export function tokenize(text, source) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const space = matchAt(WHITESPACE, text, index);
    if (space) {
      index += space.length;
      continue;
    }
    const number = matchAt(NUMBER, text, index);
    if (number) {
      const value = Number(number);
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`number '${number}' is out of range`, { start: index, end: index + number.length, source });
      }
      tokens.push({ kind: 'number', text: number, value, start: index, end: index + number.length });
      index += number.length;
      continue;
    }
    const name = matchAt(IDENTIFIER, text, index);
    if (name) {
      tokens.push({ kind: 'name', text: name, start: index, end: index + name.length });
      index += name.length;
      continue;
    }
    const symbol = text.startsWith('**', index) ? '^' : text[index];
    const width = text.startsWith('**', index) ? 2 : 1;
    if (!('+-*/^(),'.includes(symbol))) {
      throw new ExpressionError(`unexpected character '${text[index]}'`, { start: index, end: index + 1, source });
    }
    tokens.push({ kind: symbol, text: text.slice(index, index + width), start: index, end: index + width });
    index += width;
  }
  tokens.push({ kind: 'end', text: '', start: text.length, end: text.length });
  return tokens;
}

/**
 * Parses an expression into an AST of
 *   { type: 'number', value } | { type: 'name', name } | { type: 'call', name, args }
 *   | { type: 'unary', op: 'neg', arg } | { type: 'binary', op, left, right }
 * where every node carries its source span as { start, end }.
 */
export function parse(text, { source = 'expression', limits = {} } = {}) {
  const { maxLength, maxDepth, maxNodes } = { ...DEFAULT_LIMITS, ...limits };
  if (typeof text !== 'string') {
    throw new ExpressionError('expression must be a string', { source });
  }
  if (text.length > maxLength) {
    throw new ExpressionError(`expression is longer than ${maxLength} characters`, { start: maxLength, end: text.length, source });
  }
  const tokens = tokenize(text, source);
  let position = 0;
  let nodeCount = 0;

  const peek = () => tokens[position];
  const fail = (message, token = peek()) => {
    throw new ExpressionError(message, { start: token.start, end: token.end, source });
  };
  const describe = (token) => (token.kind === 'end' ? 'end of expression' : `'${token.text}'`);
  const expect = (kind) => {
    const token = peek();
    if (token.kind !== kind) fail(`expected '${kind}' but found ${describe(token)}`);
    position += 1;
    return token;
  };
  const node = (fields, start, end) => {
    nodeCount += 1;
    if (nodeCount > maxNodes) fail(`expression has more than ${maxNodes} nodes`);
    return { ...fields, start, end };
  };

  function parsePrefix(depth) {
    const token = peek();
    position += 1;
    switch (token.kind) {
      case 'number':
        return node({ type: 'number', value: token.value }, token.start, token.end);
      case 'name': {
        if (peek().kind !== '(') return node({ type: 'name', name: token.text }, token.start, token.end);
        position += 1;
        const args = [];
        if (peek().kind !== ')') {
          args.push(parseExpression(0, depth + 1));
          while (peek().kind === ',') {
            position += 1;
            args.push(parseExpression(0, depth + 1));
          }
        }
        const close = expect(')');
        return node({ type: 'call', name: token.text, args }, token.start, close.end);
      }
      case '(': {
        const inner = parseExpression(0, depth + 1);
        const close = expect(')');
        return { ...inner, start: token.start, end: close.end };
      }
      case '-': {
        const arg = parseExpression(PREFIX_POWER, depth + 1);
        return node({ type: 'unary', op: 'neg', arg }, token.start, arg.end);
      }
      case '+':
        return parseExpression(PREFIX_POWER, depth + 1);
      default:
        return fail(`unexpected ${describe(token)}`, token);
    }
  }

  function parseExpression(minPower, depth) {
    if (depth > maxDepth) fail(`expression is nested deeper than ${maxDepth} levels`);
    let left = parsePrefix(depth);
    for (;;) {
      const infix = INFIX[peek().kind];
      if (!infix || infix.power <= minPower) return left;
      position += 1;
      const right = parseExpression(infix.rightAssociative ? infix.power - 1 : infix.power, depth + 1);
      left = node({ type: 'binary', op: infix.op, left, right }, left.start, right.end);
    }
  }

  if (peek().kind === 'end') fail('expression is empty');
  const tree = parseExpression(0, 0);
  if (peek().kind !== 'end') fail(`unexpected ${describe(peek())}`);
  return tree;
}
