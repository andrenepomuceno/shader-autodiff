import { build } from './build.js';
import { gradient } from './differentiate.js';
import { evaluateGraph } from './evaluate.js';
import { emitGlsl } from './glsl.js';
import { emitJavaScript } from './javascript.js';

export { ExpressionError } from './errors.js';
export { parse, DEFAULT_LIMITS } from './parser.js';

/**
 * Compiles an expression into an object that emits GLSL and JavaScript computing its value and,
 * for `order: 1`, its gradient with respect to `variables`.
 */
export function compile(text, { variables = [], parameters = [], derived = {}, order = 1, limits = {} } = {}) {
  if (order !== 0 && order !== 1) throw new RangeError(`order ${order} is not supported yet (use 0 or 1)`);
  const built = build(text, { variables, parameters, derived, limits });
  const compiled = {
    graph: built.graph,
    root: built.root,
    gradient: order === 1 ? gradient(built.graph, built.root, built.variables) : null,
    variableNames: [...variables],
    parameterNames: [...parameters],
  };

  return {
    order,
    variables: compiled.variableNames,
    parameters: compiled.parameterNames,
    glsl: (name, options) => emitGlsl(compiled, name, options),
    js: (name) => emitJavaScript(compiled, name),
    evaluate(env) {
      const derivatives = compiled.gradient ?? [];
      const live = derivatives.filter((id) => id !== null);
      const [value, ...values] = evaluateGraph(compiled.graph, [compiled.root, ...live], env);
      if (!compiled.gradient) return { value };
      return { value, gradient: derivatives.map((id) => (id === null ? 0 : values.shift())) };
    },
  };
}
