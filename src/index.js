import { checkIdentifier } from './names.js';
import { createProgram } from './program.js';
import { matrixType, vectorType } from './targets.js';

export { ExpressionError } from './errors.js';
export { parse, DEFAULT_LIMITS } from './parser.js';
export { createProgram };

/**
 * Compiles one expression (value, gradient, Hessian) or an object of named expressions (values and
 * Jacobian) into an object that evaluates them in JS and emits GLSL, WGSL and JS.
 */
export function compile(source, { variables = [], parameters = [], derived = {}, order = 1, limits = {} } = {}) {
  if (order !== 0 && order !== 1 && order !== 2) throw new RangeError(`order ${order} is not supported (use 0, 1 or 2)`);
  const multiple = typeof source === 'object' && source !== null;
  const names = multiple ? Object.keys(source) : null;
  if (multiple) {
    if (names.length === 0) throw new TypeError('no expressions to compile');
    names.forEach((name) => checkIdentifier(name, 'output'));
    if (order === 2) throw new RangeError('order 2 needs a single expression');
  }
  const program = createProgram({ variables, parameters, derived, limits });
  const values = multiple ? names.map((name) => program.expression(source[name], name)) : [program.expression(source)];
  const count = variables.length;
  const differentiate = (value) => variables.map((variable) => program.derivative(value, variable));

  const spec = { returns: null, outputs: [] };
  if (multiple) {
    spec.outputs.push({ name: 'value', type: vectorType(values.length), components: values, shape: [values.length] });
    if (order >= 1) {
      const columns = variables.map((variable) => values.map((value) => program.derivative(value, variable)));
      spec.outputs.push({
        name: 'jacobian',
        type: matrixType(count, values.length),
        components: columns.flat(),
        shape: [values.length, count],
      });
    }
  } else {
    const [value] = values;
    spec.returns = { type: 'float', components: [value] };
    if (order >= 1) {
      const gradient = differentiate(value);
      spec.outputs.push({ name: 'gradient', type: vectorType(count), components: gradient, shape: [count] });
      if (order === 2) {
        // Only the upper triangle is differentiated; mirroring keeps H exactly symmetric.
        const upper = gradient.map((partial, i) => variables.map((variable, j) => (j >= i ? program.derivative(partial, variable) : null)));
        const hessian = upper.map((row, i) => row.map((entry, j) => entry ?? upper[j][i]));
        spec.outputs.push({
          name: 'hessian',
          type: matrixType(count, count),
          components: hessian.flat(),
          shape: [count, count],
        });
      }
    }
  }

  const emitSpec = (name, options = {}) => ({ ...spec, name, parameters: options.parameters ?? {} });
  return {
    order,
    variables: [...variables],
    parameters: [...parameters],
    outputs: names,
    glsl: (name, options) => program.glsl(emitSpec(name, options)),
    wgsl: (name, options) => program.wgsl(emitSpec(name, options)),
    js: (name) => program.js(emitSpec(name)),
    tsl: (TSL, options) => program.tsl(spec, TSL, options),
    evaluate: (env) => program.evaluateFunction(spec, env),
  };
}
