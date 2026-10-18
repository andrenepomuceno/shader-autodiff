import { createProgram } from '../../src/index.js';

export const TENSOR_KEYS = ['xx', 'xy', 'xz', 'yy', 'yz', 'zz'];
export const PULLBACK_KEYS = ['X', 'Y', 'Z'];
const COORDINATES = ['x', 'y', 'z'];
const UNIFORMS = { a: 'u_params.x', b: 'u_params.y', c: 'u_params.z', d: 'u_params.w', t: 'u_time' };

function checkKeys({ kind, components }) {
  const expected = kind === 'tensor' ? TENSOR_KEYS : kind === 'pullback' ? PULLBACK_KEYS : null;
  if (!expected) throw new TypeError(`unknown metric kind '${kind}'`);
  const keys = Object.keys(components ?? {});
  if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) {
    throw new TypeError(`${kind} metric needs exactly the components ${expected.join(', ')}; got ${keys.sort().join(', ') || 'none'}`);
  }
}

/** The six unique entries of a symmetric 3×3 matrix, as [i][j] lookups. */
function symmetric(entries) {
  const index = (i, j) => TENSOR_KEYS.indexOf(`${'xyz'[Math.min(i, j)]}${'xyz'[Math.max(i, j)]}`);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => entries[index(i, j)]));
}

function baseMatrix(program, { kind, components }) {
  if (kind === 'tensor') {
    return symmetric(TENSOR_KEYS.map((key) => program.expression(components[key], key)));
  }
  const map = PULLBACK_KEYS.map((key) => program.expression(components[key], key));
  const jacobian = map.map((component) => COORDINATES.map((coordinate) => program.derivative(component, coordinate)));
  const dot = (i, j) => [0, 1, 2]
    .map((k) => program.mul(jacobian[k][i], jacobian[k][j]))
    .reduce((sum, term) => program.add(sum, term));
  // Products are commutative-canonicalised, so dot(j, i) hash-conses to the same node as dot(i, j).
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => dot(i, j)));
}

const columnMajor = (matrix) => [0, 1, 2].flatMap((column) => [0, 1, 2].map((row) => matrix[row][column]));

/**
 * Compiles a metric-shaders MetricSpec ({ kind: 'tensor' | 'pullback', components }) into
 *   mat3 metricTensor(vec3 p)
 *   void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz)
 * for g_s = (1 − s)·I + s·g with s = u_morph, matching the sympy compiler of metric-shaders.
 */
export function compileMetric(spec) {
  checkKeys(spec);
  const program = createProgram({
    variables: COORDINATES,
    parameters: ['a', 'b', 'c', 'd', 't', 'u_morph'],
    derived: { r: 'sqrt(x*x + y*y + z*z)' },
  });
  const morph = program.expression('u_morph');
  const identityWeight = program.sub(program.constant(1), morph);
  const metric = baseMatrix(program, spec).map((row, i) => row.map((entry, j) => {
    const scaled = program.mul(morph, entry);
    return i === j ? program.add(identityWeight, scaled) : scaled;
  }));
  const partials = COORDINATES.map((coordinate) => metric.map((row) => row.map((entry) => program.derivative(entry, coordinate))));

  const tensorSpec = { name: 'metricTensor', returns: { type: 'mat3', components: columnMajor(metric) }, parameters: UNIFORMS };
  const partialsSpec = {
    name: 'metricPartials',
    outputs: ['dgdx', 'dgdy', 'dgdz'].map((name, k) => ({ name, type: 'mat3', components: columnMajor(partials[k]) })),
    parameters: UNIFORMS,
  };

  return {
    glsl: `${program.glsl(tensorSpec)}\n${program.glsl(partialsSpec)}`,
    wgsl: `${program.wgsl(tensorSpec)}\n${program.wgsl(partialsSpec)}`,
    /** `uniforms` holds a, b, c, d, t and s (the morph); returns 3×3 arrays of rows. */
    evaluate([x, y, z], { a = 0, b = 0, c = 0, d = 0, t = 0, s = 1 } = {}) {
      const env = { x, y, z, a, b, c, d, t, u_morph: s };
      const { value } = program.evaluateFunction(tensorSpec, env);
      const { dgdx, dgdy, dgdz } = program.evaluateFunction(partialsSpec, env);
      return { metric: value, partials: [dgdx, dgdy, dgdz] };
    },
  };
}
