import { compile, ExpressionError } from '../../src/index.js';
import { inEditor, readSource } from '../shared/editor.js';

export const PRESETS = {
  'Ripples': `// a: amplitude, b: wavelength
r = sqrt(x^2 + z^2 + 0.01)
k = 9 - 6*b
(0.1 + 0.4*a)*sin(k*r - 3*t)/(1 + 2*r)`,

  'Crossing waves': `// a: steepness, b: second wave's angle
c = cos(1.5*b)
s = sin(1.5*b)
w1 = sin(3*x + 2*t)
w2 = sin(4*(c*x + s*z) - 3*t)
0.25*(w1 + w2)*(0.4 + a)`,

  'Moving hills': `// a: height, b: spread
h1 = exp(-((x - cos(t))^2 + (z - sin(t))^2)/(0.1 + 0.4*b))
h2 = exp(-((x + sin(0.7*t))^2 + (z + 0.8)^2)/(0.2 + 0.3*b))
(0.2 + 0.8*a)*(h1 - 0.6*h2)`,

  'Rolling terrain': `// a: roughness, b: scale
s = 1 + 2*b
n1 = sin(s*x + 0.3*t)*cos(s*z)
n2 = sin(2.3*s*z - 1.1*x)*cos(1.7*s*x + 0.5*t)
n3 = sin(4.1*s*(x + z))*cos(3.7*s*(x - z))
0.3*n1 + 0.15*a*n2 + 0.07*a^2*n3`,

  'Twisted box': `// a: twist, b: taper; base: box
q = (0.4 + 2*a)*y*(1 + 0.5*sin(0.7*t))
s = 1 - 0.4*b*y
X = s*(x*cos(q) - z*sin(q))
Y = y
Z = s*(x*sin(q) + z*cos(q))`,

  'Breathing sphere': `// a: bump height, b: frequency; base: sphere
k = 3 + 5*b
s = 1 + 0.25*a*sin(k*x + t)*sin(k*y + 1.3*t)*sin(k*z)
X = s*x
Y = s*y
Z = s*z`,

  'Bent bar': `// a: bend, b: thickness; base: bar
k = 0.05 + 0.9*a*(0.6 + 0.4*sin(t))
w = 0.6 + 0.8*b
X = sin(k*x)/k - w*y*sin(k*x)
Y = (1 - cos(k*x))/k + w*y*cos(k*x)
Z = w*z`,
};

const WARP_BASES = ['sphere', 'box', 'bar'];
const OUTPUTS = ['X', 'Y', 'Z'];

/** The exact program now; the value-only one (finite differences) on first use. */
function surface(read, mode, base, source, options) {
  const exact = inEditor(read, () => compile(source, { ...options, order: 1 }));
  let value = null;
  return {
    mode,
    base,
    exact,
    get value() {
      value ??= compile(source, { ...options, order: 0 });
      return value;
    },
  };
}

/** The warp's base mesh from a `// … base: <mesh>` comment, sphere by default. */
function warpBase(text) {
  const match = /\/\/[^\n]*?\bbase:[ \t]*(\w*)/d.exec(text);
  if (!match) return 'sphere';
  const [start, end] = match.indices[1];
  if (!WARP_BASES.includes(match[1])) {
    throw new ExpressionError(`unknown base '${match[1]}' (use ${WARP_BASES.join(', ')})`, { start, end });
  }
  return match[1];
}

/**
 * Reads the editor text as a height field y = h(x, z) (the last line is an expression) or as a warp
 * (x, y, z) → (X, Y, Z) of a base mesh (no final expression; X, Y and Z are defined) and compiles it
 * with its derivatives.
 */
export function compileSurface(text) {
  const read = readSource(text);
  const parameters = ['t', 'a', 'b'];
  if (read.expression !== null) {
    return surface(read, 'height', 'plane', read.expression, { variables: ['x', 'z'], parameters, derived: read.definitions });
  }
  const missing = OUTPUTS.filter((name) => !Object.hasOwn(read.definitions, name));
  if (missing.length === 3) {
    throw new ExpressionError('end with an expression h(x, z), or define X, Y and Z for a warp', { start: text.length });
  }
  if (missing.length > 0) throw new ExpressionError(`a warp needs X, Y and Z; ${missing.join(' and ')} missing`, { start: text.length });
  const expressions = Object.fromEntries(OUTPUTS.map((name) => [name, read.definitions[name]]));
  const derived = Object.fromEntries(Object.entries(read.definitions).filter(([name]) => !OUTPUTS.includes(name)));
  return surface(read, 'warp', warpBase(text), expressions, { variables: ['x', 'y', 'z'], parameters, derived });
}

/**
 * TSL nodes for a compiled surface: the displaced position and its normal, both in local space, from
 * the undisplaced `position` and `normal` nodes. Exact normals use the gradient (height field) or the
 * Jacobian J (warp: the normal maps by the cofactor matrix det(J)·J⁻ᵀ, whose columns are cross products
 * of J's columns); `epsilon` switches to central differences of the value instead.
 */
export function surfaceNodes(surface, TSL, { position, normal, parameters, epsilon = 0 }) {
  const { add, sub, mul, div, negate, cross, normalize, vec3, float } = TSL;
  if (surface.mode === 'height') {
    const height = (x, z) => surface.value.tsl(TSL, { inputs: [x, z], parameters }).value;
    const { value, gradient } = surface.exact.tsl(TSL, { inputs: [position.x, position.z], parameters });
    let slope = [gradient.x, gradient.y];
    if (epsilon > 0) {
      const e = float(epsilon);
      slope = [
        div(sub(height(add(position.x, e), position.z), height(sub(position.x, e), position.z)), float(2 * epsilon)),
        div(sub(height(position.x, add(position.z, e)), height(position.x, sub(position.z, e))), float(2 * epsilon)),
      ];
    }
    return {
      position: vec3(position.x, value, position.z),
      normal: normalize(vec3(negate(slope[0]), float(1), negate(slope[1]))),
    };
  }

  const point = [position.x, position.y, position.z];
  const warp = (inputs) => surface.value.tsl(TSL, { inputs, parameters }).value;
  const { value, jacobian } = surface.exact.tsl(TSL, { inputs: point, parameters });
  const axes = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];
  let columns = axes.map((axis) => mul(jacobian, axis));
  if (epsilon > 0) {
    const e = float(epsilon);
    const shifted = (j, step) => point.map((component, k) => (k === j ? step(component, e) : component));
    columns = [0, 1, 2].map((j) => div(sub(warp(shifted(j, add)), warp(shifted(j, sub))), float(2 * epsilon)));
  }
  const [c1, c2, c3] = columns;
  return {
    position: value,
    normal: normalize(add(add(mul(cross(c2, c3), normal.x), mul(cross(c3, c1), normal.y)), mul(cross(c1, c2), normal.z))),
  };
}
