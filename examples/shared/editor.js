import { ExpressionError } from '../../src/index.js';

/**
 * Splits the editor text into `name = expression` lines (compiled as `derived` or as named outputs)
 * and an optional final expression, keeping each piece's offset in the text so errors can be mapped
 * back. `// …` comments are ignored.
 */
export function readSource(text) {
  const definitions = Object.create(null);
  const offsets = Object.create(null);
  let expression = null;
  let lineStart = 0;
  for (const line of text.split('\n')) {
    const code = line.replace(/\/\/.*$/, '');
    const definition = /^(\s*)([A-Za-z_]\w*)(\s*=\s*)(.*)$/.exec(code);
    if (code.trim() !== '' && expression) {
      throw new ExpressionError('only the last line may be an expression (write helpers as `name = …`)', {
        start: expression.offset,
        end: expression.offset + expression.text.length,
      });
    }
    if (definition) {
      const [, indent, name, equals, body] = definition;
      if (Object.hasOwn(definitions, name)) {
        throw new ExpressionError(`'${name}' is defined twice`, { start: lineStart + indent.length, end: lineStart + indent.length + name.length });
      }
      definitions[name] = body;
      offsets[name] = lineStart + indent.length + name.length + equals.length;
    } else if (code.trim() !== '') {
      expression = { text: code, offset: lineStart };
    }
    lineStart += line.length + 1;
  }
  return { definitions, offsets, expression: expression?.text ?? null, expressionOffset: expression?.offset ?? null };
}

/**
 * Runs `build`, moving the span of an ExpressionError raised for one piece of the text (its `source`
 * is `expression`, `derived.<name>` or the name of a named expression) to where that piece sits in
 * the editor.
 */
export function inEditor(read, build) {
  try {
    return build();
  } catch (error) {
    if (!(error instanceof ExpressionError) || typeof error.source !== 'string' || error.start === undefined) throw error;
    const name = error.source.replace(/^derived\./, '');
    const offset = error.source === 'expression' ? read.expressionOffset : Object.hasOwn(read.offsets, name) ? read.offsets[name] : null;
    if (offset === undefined || offset === null) throw error;
    throw new ExpressionError(error.reason, { start: offset + error.start, end: offset + error.end });
  }
}

/**
 * Wires a textarea over a backdrop that mirrors its text with the error span marked, and an error
 * line. `compile(text)` is called (debounced) on input and on `load`; it may throw ExpressionError.
 */
export function createEditor({ source, backdrop, error, onEdit = () => {} }, compile) {
  function show(message, span = null) {
    error.textContent = message ?? '';
    source.setAttribute('aria-invalid', String(Boolean(message)));
    render(span);
  }

  function render(span) {
    const text = source.value;
    if (!span) {
      backdrop.replaceChildren(text, '\n');
    } else {
      const marked = text.slice(span.start, Math.max(span.end, span.start + 1));
      const empty = marked === '' || marked === '\n';
      const mark = document.createElement('mark');
      mark.textContent = empty ? ' ' : marked;
      const rest = text.slice(empty ? span.start : span.start + marked.length);
      backdrop.replaceChildren(text.slice(0, span.start), mark, rest, '\n');
    }
    sync();
  }

  function sync() {
    backdrop.scrollTop = source.scrollTop;
    backdrop.scrollLeft = source.scrollLeft;
  }

  function update() {
    try {
      compile(source.value);
    } catch (caught) {
      if (caught instanceof ExpressionError) {
        const line = source.value.slice(0, caught.start).split('\n').length;
        show(`line ${line}: ${caught.reason}`, caught);
      } else {
        show(caught.message);
      }
      return false;
    }
    show(null);
    return true;
  }

  let pending = 0;
  source.addEventListener('input', () => {
    onEdit();
    render(null);
    clearTimeout(pending);
    pending = setTimeout(update, 250);
  });
  source.addEventListener('scroll', sync);

  return {
    show,
    load(text) {
      clearTimeout(pending);
      source.value = text;
      return update();
    },
  };
}
