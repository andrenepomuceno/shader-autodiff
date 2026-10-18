export class ExpressionError extends Error {
  constructor(message, { start = 0, end = start, source = 'expression' } = {}) {
    super(`${source}: ${message} (at ${start})`);
    this.name = 'ExpressionError';
    this.reason = message;
    this.start = start;
    this.end = end;
    this.source = source;
  }
}
