// GPU benchmarks (tools/gpu/bench.html): per-pixel cost of value, exact derivatives and finite
// differences on WebGL2 and WebGPU, and float32 precision of exact derivatives against finite
// differences at several ε on WebGL2. Results are printed as Markdown and left in window.benchResults.
import { compile } from '../../src/index.js';
import { compileMetric } from '../../examples/metric-shaders/metric.js';
import { benchmarkFields, groupError, random } from './cases.js';

// Slower GPUs can shrink the run from the URL, e.g. bench.html?size=512&dispatches=4; costs stay
// per pixel, so they remain comparable.
const query = new URLSearchParams(location.search);
const SIZE = Number(query.get('size') ?? 2048); // cost target side: one point per pixel per iteration
const ITERATIONS = 16; // evaluations per pixel per frame, at points shifted by i * DELTA
const ROUNDS = 3; // variants are interleaved round-robin; ROUNDS × FRAMES timed frames per variant
const FRAMES = 5;
const WARMUP = 2;
const DISPATCHES = Number(query.get('dispatches') ?? 32); // WebGPU: dispatches per timed pass, because Chrome quantizes timestamps
const PIXELS = SIZE * SIZE;
const EPSILONS = [1e-1, 1e-2, 1e-3, 1e-4];
const POINTS_SIDE = 64; // precision: POINTS_SIDE² random points per case
const POINTS = POINTS_SIDE * POINTS_SIDE;
const FIELD_PARAMETERS = { a: 0.5, b: 0.5, t: 1.25 };
const DELTA = [0.0137, 0.0071, 0.0113];
const SLICE_Z = 0.37;
const WEIGHTS = [0.3, 0.5, 0.7]; // folds every matrix entry into the output so nothing is dead
const COST_EPSILON = 1e-3;

const logElement = document.getElementById('log');
const reportElement = document.getElementById('report');
const lines = [];
const log = (text) => {
  lines.push(text);
  logElement.textContent = lines.join('\n');
};

// Not a timer, so it is not throttled in background tabs.
const yieldToEventLoop = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => resolve();
  channel.port2.postMessage(null);
});

const mapValues = (object, fn) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value, key)]));

function summary(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (q) => finite[Math.min(finite.length - 1, Math.floor(q * finite.length))];
  const mid = finite.length >> 1;
  return {
    median: finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2,
    p95: at(0.95),
    max: finite[finite.length - 1],
    nonFinite: values.length - finite.length,
  };
}

function angleDegrees(actual, expected) {
  const na = Math.hypot(...actual);
  const ne = Math.hypot(...expected);
  if (!(na > 0) || !(ne > 0)) return 90;
  const cosine = (actual[0] * expected[0] + actual[1] * expected[1] + actual[2] * expected[2]) / (na * ne);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------------------------
// Cases: fields f(x, y, z; a, b, t) and metric presets, with every variant as a shader snippet.
// A variant is a `probe` returning vec4(value, gradient) (fields) or a `body` defining g (and
// dx, dy, dz) (metrics), in GLSL and WGSL.

const FIELD_OPTIONS = { variables: ['x', 'y', 'z'], parameters: ['a', 'b', 't'] };
const FIELD_RENAMES = { parameters: { a: 'u_a', b: 'u_b', t: 'u_t' } };

function fieldCase(field) {
  const options = { ...FIELD_OPTIONS, derived: field.derived ?? {} };
  const value = compile(field.expression, { ...options, order: 0 });
  const exact = compile(field.expression, { ...options, order: 1 });
  return {
    ...field,
    compiled: exact,
    glsl: { value: value.glsl('f0', FIELD_RENAMES), exact: exact.glsl('f1', FIELD_RENAMES) },
    wgsl: { value: value.wgsl('f0'), exact: exact.wgsl('f1') },
  };
}

const FIELD_SOURCE = { value: 'value', exact: 'exact', fd4: 'value', fd6: 'value' };

// fd4: the tetrahedron stencil (4 evaluations); fd6: central differences (6). Both also return a
// value, the mean of the taps, so every variant produces value + gradient.
const FIELD_PROBES = {
  glsl: {
    value: 'return vec4(f0(p), 0.0, 0.0, 0.0);',
    exact: 'vec3 g; float v = f1(p, g); return vec4(v, g);',
    fd4: `const vec2 k = vec2(1.0, -1.0);
    float s0 = f0(p + k.xyy * u_eps);
    float s1 = f0(p + k.yyx * u_eps);
    float s2 = f0(p + k.yxy * u_eps);
    float s3 = f0(p + k.xxx * u_eps);
    return vec4(0.25 * (s0 + s1 + s2 + s3), (k.xyy * s0 + k.yyx * s1 + k.yxy * s2 + k.xxx * s3) / (4.0 * u_eps));`,
    fd6: `const vec2 e = vec2(1.0, 0.0);
    float px = f0(p + e.xyy * u_eps);
    float mx = f0(p - e.xyy * u_eps);
    float py = f0(p + e.yxy * u_eps);
    float my = f0(p - e.yxy * u_eps);
    float pz = f0(p + e.yyx * u_eps);
    float mz = f0(p - e.yyx * u_eps);
    return vec4((px + mx + py + my + pz + mz) / 6.0, vec3(px - mx, py - my, pz - mz) / (2.0 * u_eps));`,
  },
  wgsl: {
    value: 'return vec4<f32>(f0(p), 0.0, 0.0, 0.0);',
    exact: 'var g: vec3<f32>; let v = f1(p, &g); return vec4<f32>(v, g);',
    fd4: `let k = vec2<f32>(1.0, -1.0);
    let s0 = f0(p + k.xyy * P.eps);
    let s1 = f0(p + k.yyx * P.eps);
    let s2 = f0(p + k.yxy * P.eps);
    let s3 = f0(p + k.xxx * P.eps);
    return vec4<f32>(0.25 * (s0 + s1 + s2 + s3), (k.xyy * s0 + k.yyx * s1 + k.yxy * s2 + k.xxx * s3) / (4.0 * P.eps));`,
    fd6: `let e = vec2<f32>(1.0, 0.0);
    let px = f0(p + e.xyy * P.eps);
    let mx = f0(p - e.xyy * P.eps);
    let py = f0(p + e.yxy * P.eps);
    let my = f0(p - e.yxy * P.eps);
    let pz = f0(p + e.yyx * P.eps);
    let mz = f0(p - e.yyx * P.eps);
    return vec4<f32>((px + mx + py + my + pz + mz) / 6.0, vec3<f32>(px - mx, py - my, pz - mz) / (2.0 * P.eps));`,
  },
};

function metricCase(preset) {
  const ours = compileMetric({ kind: preset.kind, components: preset.components });
  const { uniforms } = preset.samples[0]; // the preset defaults, morph s = 1
  return { id: preset.id, ours, sympyGlsl: preset.glsl, uniforms };
}

const METRIC_SOURCE = { tensor: 'ours', exact: 'ours', sympy: 'sympy', fd: 'ours' };

const METRIC_PARTIALS_GLSL = 'mat3 g = metricTensor(p); mat3 dx; mat3 dy; mat3 dz; metricPartials(p, dx, dy, dz);';
const METRIC_BODIES = {
  glsl: {
    tensor: 'mat3 g = metricTensor(p);',
    exact: METRIC_PARTIALS_GLSL,
    sympy: METRIC_PARTIALS_GLSL,
    fd: `mat3 g = metricTensor(p);
    const vec2 e = vec2(1.0, 0.0);
    mat3 dx = (metricTensor(p + e.xyy * u_eps) - metricTensor(p - e.xyy * u_eps)) / (2.0 * u_eps);
    mat3 dy = (metricTensor(p + e.yxy * u_eps) - metricTensor(p - e.yxy * u_eps)) / (2.0 * u_eps);
    mat3 dz = (metricTensor(p + e.yyx * u_eps) - metricTensor(p - e.yyx * u_eps)) / (2.0 * u_eps);`,
  },
  wgsl: {
    tensor: 'let g = metricTensor(p);',
    exact: 'let g = metricTensor(p); var dx: mat3x3<f32>; var dy: mat3x3<f32>; var dz: mat3x3<f32>; metricPartials(p, &dx, &dy, &dz);',
    fd: `let g = metricTensor(p);
    let e = vec2<f32>(1.0, 0.0);
    let dx = (metricTensor(p + e.xyy * P.eps) - metricTensor(p - e.xyy * P.eps)) * (0.5 / P.eps);
    let dy = (metricTensor(p + e.yxy * P.eps) - metricTensor(p - e.yxy * P.eps)) * (0.5 / P.eps);
    let dz = (metricTensor(p + e.yyx * P.eps) - metricTensor(p - e.yyx * P.eps)) * (0.5 / P.eps);`,
  },
};

const metricProbe = (lang, name) => {
  const w = lang === 'glsl' ? 'u_w' : 'P.w.xyz';
  const reduction = name === 'tensor' ? `g * ${w}` : `g * ${w} + dx * ${w}.yzx + dy * ${w}.zxy + dz * ${w}.xzy`;
  return `${METRIC_BODIES[lang][name]}\n    return ${lang === 'glsl' ? 'vec4' : 'vec4<f32>'}(${reduction}, 0.0);`;
};

function fieldPoints({ domain: [low, high] = [-2, 2] }) {
  const next = random(2029);
  return Array.from({ length: POINTS }, () => [0, 1, 2].map(() => Math.fround(low + (high - low) * next())));
}

function metricPoints() {
  const next = random(2030);
  const points = [];
  while (points.length < POINTS) {
    const point = [0, 1, 2].map(() => Math.fround(-3 + 6 * next()));
    if (Math.hypot(...point) >= 0.2) points.push(point);
  }
  return points;
}

// ---------------------------------------------------------------------------------------------
// WebGL2

const VERTEX = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }`;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform float u_a;
uniform float u_b;
uniform float u_t;
uniform vec4 u_params;
uniform float u_time;
uniform float u_morph;
uniform float u_eps;
uniform vec3 u_delta;
uniform float u_z;
uniform vec3 u_w;
uniform sampler2D u_points;
uniform int u_group;
out vec4 color;
`;

const costShader = (functions, probe) => `${HEADER}
${functions}
vec4 probe(vec3 p) {
    ${probe}
}
void main() {
    vec3 p = vec3(gl_FragCoord.xy * (4.0 / ${SIZE}.0) - 2.0, u_z);
    vec4 acc = vec4(0.0);
    for (int i = 0; i < ${ITERATIONS}; i++) acc += probe(p + float(i) * u_delta);
    color = acc;
}`;

const fieldPrecisionShader = (functions, probe) => `${HEADER}
${functions}
vec4 probe(vec3 p) {
    ${probe}
}
void main() {
    color = probe(texelFetch(u_points, ivec2(gl_FragCoord.xy), 0).xyz);
}`;

// 27 partial entries (row-major, dx then dy then dz) read back four at a time with u_group.
const metricPrecisionShader = (functions, body) => `${HEADER}
${functions}
void main() {
    vec3 p = texelFetch(u_points, ivec2(gl_FragCoord.xy), 0).xyz;
    ${body}
    float v[28];
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            v[i * 3 + j] = dx[j][i];
            v[9 + i * 3 + j] = dy[j][i];
            v[18 + i * 3 + j] = dz[j][i];
        }
    }
    v[27] = 0.0;
    int k = u_group * 4;
    color = vec4(v[k], v[k + 1], v[k + 2], v[k + 3]);
}`;

function createContext() {
  const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance', antialias: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const cost = gl.createFramebuffer();
  const renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, SIZE, SIZE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, cost);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);

  const texture = (internalFormat) => {
    const handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, POINTS_SIDE, POINTS_SIDE, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return handle;
  };
  const precision = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, precision);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture(gl.RGBA32F), 0);
  const points = texture(gl.RGBA32F);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, points);
  return { gl, timer, renderer, cost, precision, points };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`GLSL compile error: ${gl.getShaderInfoLog(shader)}\n${source}`);
  }
  return shader;
}

function createProgram(gl, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link error: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'u_points'), 0);
  return program;
}

function useProgram(gl, program, uniforms) {
  gl.useProgram(program);
  for (const [name, value] of Object.entries(uniforms)) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) continue;
    if (typeof value === 'number') gl.uniform1f(location, value);
    else if (value.length === 3) gl.uniform3fv(location, value);
    else gl.uniform4fv(location, value);
  }
}

function drawCost({ gl, cost }, program, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, cost);
  gl.viewport(0, 0, SIZE, SIZE);
  useProgram(gl, program, uniforms);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function uploadPoints({ gl, points }, list) {
  gl.bindTexture(gl.TEXTURE_2D, points);
  const data = new Float32Array(list.flatMap(([x, y, z]) => [x, y, z, 0]));
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, POINTS_SIDE, POINTS_SIDE, gl.RGBA, gl.FLOAT, data);
}

/** Runs `program` once per point (u_points texture) and returns POINTS × 4 floats. */
function readProbe({ gl, precision }, program, uniforms, group = 0) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, precision);
  gl.viewport(0, 0, POINTS_SIDE, POINTS_SIDE);
  useProgram(gl, program, uniforms);
  gl.uniform1i(gl.getUniformLocation(program, 'u_group'), group);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const pixels = new Float32Array(POINTS * 4);
  gl.readPixels(0, 0, POINTS_SIDE, POINTS_SIDE, gl.RGBA, gl.FLOAT, pixels);
  return pixels;
}

/** GPU milliseconds of `frames` draws: timer queries when available, else wall-clock around gl.finish(). */
async function timeFrames({ gl, timer }, draw, frames) {
  if (!timer) {
    const pixel = new Uint8Array(4);
    const times = [];
    for (let i = 0; i < frames; i += 1) {
      gl.finish();
      const start = performance.now();
      draw();
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // makes sure the GPU is really done
      times.push(performance.now() - start);
    }
    return times;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    gl.getParameter(timer.GPU_DISJOINT_EXT); // clears the flag
    const queries = Array.from({ length: frames }, () => gl.createQuery());
    for (const query of queries) {
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      draw();
      gl.endQuery(timer.TIME_ELAPSED_EXT);
    }
    gl.flush();
    while (!gl.getQueryParameter(queries[frames - 1], gl.QUERY_RESULT_AVAILABLE)) await yieldToEventLoop();
    const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
    const times = queries.map((query) => gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    queries.forEach((query) => gl.deleteQuery(query));
    if (!disjoint) return times;
  }
  throw new Error('timer queries kept reporting GPU_DISJOINT_EXT');
}

/** Median ns per pixel (ITERATIONS evaluations) of every variant, variants interleaved round-robin. */
async function timeVariants(context, draws) {
  const samples = mapValues(draws, () => []);
  for (const draw of Object.values(draws)) for (let i = 0; i < WARMUP; i += 1) draw();
  context.gl.finish();
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const [name, draw] of Object.entries(draws)) samples[name].push(...await timeFrames(context, draw, FRAMES));
  }
  return mapValues(samples, (times) => (summary(times).median * 1e6) / PIXELS);
}

const fieldUniforms = { u_a: FIELD_PARAMETERS.a, u_b: FIELD_PARAMETERS.b, u_t: FIELD_PARAMETERS.t, u_delta: DELTA, u_z: SLICE_Z };
const metricUniforms = ({ a, b, c, d, t, s }) => ({ u_params: [a, b, c, d], u_time: t, u_morph: s, u_delta: DELTA, u_z: SLICE_Z, u_w: WEIGHTS });

function fieldReferences(field, points) {
  return points.map(([x, y, z]) => field.compiled.evaluate({ x, y, z, ...FIELD_PARAMETERS }).gradient);
}

function gradientStats(pixels, references) {
  const errors = [];
  const angles = [];
  references.forEach((reference, index) => {
    const gradient = Array.from(pixels.subarray(index * 4 + 1, index * 4 + 4));
    errors.push(groupError(gradient, reference));
    angles.push(angleDegrees(gradient, reference));
  });
  return { error: summary(errors), angle: summary(angles) };
}

async function runWebGl2(fields, presets) {
  const context = createContext();
  const { gl } = context;
  const report = {
    renderer: context.renderer,
    timing: context.timer ? 'EXT_disjoint_timer_query_webgl2' : 'wall-clock around gl.finish() + readPixels',
    fields: [],
    metrics: [],
    precision: { fields: [], metrics: [] },
  };
  log(`WebGL2 on ${report.renderer}, timing: ${report.timing}`);

  const baseline = createProgram(gl, costShader('', 'return vec4(p, 0.0);'));
  report.baseline = (await timeVariants(context, { baseline: () => drawCost(context, baseline, fieldUniforms) })).baseline;
  gl.deleteProgram(baseline);
  log(`  baseline (no evaluation): ${report.baseline.toFixed(3)} ns per pixel`);

  for (const field of fields) {
    const programs = mapValues(FIELD_PROBES.glsl, (probe, name) => createProgram(gl, costShader(field.glsl[FIELD_SOURCE[name]], probe)));
    const uniforms = { ...fieldUniforms, u_eps: COST_EPSILON };
    const ns = await timeVariants(context, mapValues(programs, (program) => () => drawCost(context, program, uniforms)));
    Object.values(programs).forEach((program) => gl.deleteProgram(program));
    report.fields.push({ id: field.id, ns });
    log(`  ${field.id.padEnd(16)} ${Object.entries(ns).map(([name, value]) => `${name} ${value.toFixed(2)}`).join('  ')}`);
  }

  for (const preset of presets) {
    const sources = { ours: preset.ours.glsl, sympy: preset.sympyGlsl };
    const programs = mapValues(METRIC_BODIES.glsl, (_, name) => createProgram(gl, costShader(sources[METRIC_SOURCE[name]], metricProbe('glsl', name))));
    const uniforms = { ...metricUniforms(preset.uniforms), u_eps: COST_EPSILON };
    const ns = await timeVariants(context, mapValues(programs, (program) => () => drawCost(context, program, uniforms)));
    Object.values(programs).forEach((program) => gl.deleteProgram(program));
    report.metrics.push({ id: preset.id, ns });
    log(`  ${preset.id.padEnd(24)} ${Object.entries(ns).map(([name, value]) => `${name} ${value.toFixed(2)}`).join('  ')}`);
  }

  log('WebGL2 precision');
  for (const field of fields) {
    const points = fieldPoints(field);
    uploadPoints(context, points);
    const references = fieldReferences(field, points);
    const run = (name, eps) => {
      const program = createProgram(gl, fieldPrecisionShader(field.glsl[FIELD_SOURCE[name]], FIELD_PROBES.glsl[name]));
      const stats = gradientStats(readProbe(context, program, { ...fieldUniforms, u_eps: eps }), references);
      gl.deleteProgram(program);
      return stats;
    };
    const entry = { id: field.id, exact: run('exact', 0), fd4: {}, fd6: {} };
    for (const eps of EPSILONS) {
      entry.fd4[eps] = run('fd4', eps);
      entry.fd6[eps] = run('fd6', eps);
    }
    report.precision.fields.push(entry);
    log(`  ${field.id.padEnd(16)} angle° median: exact ${entry.exact.angle.median.toExponential(1)}  ${EPSILONS.map((eps) => `fd6@${eps} ${entry.fd6[eps].angle.median.toExponential(1)}`).join('  ')}`);
  }

  const metricPointList = metricPoints();
  uploadPoints(context, metricPointList);
  for (const preset of presets) {
    const uniforms = preset.uniforms;
    const references = metricPointList.map((point) => preset.ours.evaluate(point, uniforms).partials.flat(2));
    const run = (name, eps) => {
      const source = name === 'sympy' ? preset.sympyGlsl : preset.ours.glsl;
      const program = createProgram(gl, metricPrecisionShader(source, METRIC_BODIES.glsl[name]));
      const groups = Array.from({ length: 7 }, (_, group) => readProbe(context, program, { ...metricUniforms(uniforms), u_eps: eps }, group));
      gl.deleteProgram(program);
      const errors = references.map((reference, index) => {
        const actual = groups.flatMap((pixels) => Array.from(pixels.subarray(index * 4, index * 4 + 4))).slice(0, 27);
        return groupError(actual, reference);
      });
      return summary(errors);
    };
    const entry = { id: preset.id, exact: run('exact', 0), sympy: run('sympy', 0), fd: {} };
    for (const eps of EPSILONS) entry.fd[eps] = run('fd', eps);
    report.precision.metrics.push(entry);
    log(`  ${preset.id.padEnd(24)} median: exact ${entry.exact.median.toExponential(1)}  sympy ${entry.sympy.median.toExponential(1)}  ${EPSILONS.map((eps) => `fd@${eps} ${entry.fd[eps].median.toExponential(1)}`).join('  ')}`);
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return report;
}

// ---------------------------------------------------------------------------------------------
// WebGPU: the same cost measurement as a compute shader, one invocation per pixel.

const kernelWgsl = (functions, probe) => `
struct Params { a: f32, b: f32, t: f32, eps: f32, delta: vec4<f32>, params: vec4<f32>, time: f32, morph: f32, pad0: f32, pad1: f32, w: vec4<f32> }
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> outputs: array<f32>;
var<private> a: f32;
var<private> b: f32;
var<private> t: f32;
var<private> u_params: vec4<f32>;
var<private> u_time: f32;
var<private> u_morph: f32;
${functions}
fn probe(p: vec3<f32>) -> vec4<f32> {
    ${probe}
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    a = P.a;
    b = P.b;
    t = P.t;
    u_params = P.params;
    u_time = P.time;
    u_morph = P.morph;
    let p = vec3<f32>(vec2<f32>(id.xy) * (4.0 / ${SIZE}.0) - 2.0, P.delta.w);
    var acc = vec4<f32>(0.0);
    for (var i = 0; i < ${ITERATIONS}; i++) {
        acc += probe(p + f32(i) * P.delta.xyz);
    }
    outputs[id.y * ${SIZE}u + id.x] = dot(acc, vec4<f32>(1.0));
}`;

const fieldParams = () => new Float32Array([
  FIELD_PARAMETERS.a, FIELD_PARAMETERS.b, FIELD_PARAMETERS.t, COST_EPSILON, ...DELTA, SLICE_Z, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const metricParams = ({ a, b, c, d, t, s }) => new Float32Array([
  0, 0, 0, COST_EPSILON, ...DELTA, SLICE_Z, a, b, c, d, t, s, 0, 0, ...WEIGHTS, 0,
]);

async function runWebGpu(fields, presets) {
  if (!navigator.gpu) return { unavailable: 'navigator.gpu missing' };
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return { unavailable: 'no adapter' };
  const timestamps = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: timestamps ? ['timestamp-query'] : [] });
  const info = adapter.info ?? {};
  const report = {
    adapter: [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') || 'unknown',
    timing: timestamps
      ? `timestamp-query around compute passes of ${DISPATCHES} dispatches`
      : `wall-clock around queue.onSubmittedWorkDone() for passes of ${DISPATCHES} dispatches`,
    fields: [],
    metrics: [],
  };
  log(`WebGPU on ${report.adapter}, timing: ${report.timing}`);

  const output = device.createBuffer({ size: SIZE * SIZE * 4, usage: GPUBufferUsage.STORAGE });
  const uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  async function kernel(functions, probe) {
    const code = kernelWgsl(functions, probe);
    const module = device.createShaderModule({ code });
    const messages = (await module.getCompilationInfo()).messages.filter((message) => message.type === 'error');
    if (messages.length) throw new Error(`WGSL error: ${messages.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('; ')}\n${code}`);
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: output } }],
    });
    return { pipeline, bindGroup };
  }

  /** Milliseconds per frame (one dispatch over SIZE² invocations) of `passes` timed passes. */
  async function timePasses({ pipeline, bindGroup }, passes) {
    const encoder = device.createCommandEncoder();
    let querySet;
    let resolve;
    let readback;
    if (timestamps) {
      querySet = device.createQuerySet({ type: 'timestamp', count: 2 * passes });
      resolve = device.createBuffer({ size: 16 * passes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      readback = device.createBuffer({ size: 16 * passes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    for (let i = 0; i < passes; i += 1) {
      const pass = encoder.beginComputePass(timestamps ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } } : {});
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      for (let j = 0; j < DISPATCHES; j += 1) pass.dispatchWorkgroups(SIZE / 8, SIZE / 8);
      pass.end();
    }
    if (timestamps) {
      encoder.resolveQuerySet(querySet, 0, 2 * passes, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16 * passes);
    }
    const start = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wall = performance.now() - start;
    if (!timestamps) return [wall / (passes * DISPATCHES)];
    await readback.mapAsync(GPUMapMode.READ);
    const stamps = new BigUint64Array(readback.getMappedRange());
    const times = Array.from({ length: passes }, (_, i) => Number(stamps[2 * i + 1] - stamps[2 * i]) / 1e6 / DISPATCHES);
    readback.unmap();
    [resolve, readback].forEach((buffer) => buffer.destroy());
    querySet.destroy();
    return times;
  }

  async function timeKernels(kernels, params) {
    device.queue.writeBuffer(uniform, 0, params);
    const samples = mapValues(kernels, () => []);
    for (const entry of Object.values(kernels)) await timePasses(entry, 1);
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const [name, entry] of Object.entries(kernels)) samples[name].push(...await timePasses(entry, FRAMES));
    }
    return mapValues(samples, (times) => (summary(times).median * 1e6) / PIXELS);
  }

  report.baseline = (await timeKernels({ baseline: await kernel('', 'return vec4<f32>(p, 0.0);') }, fieldParams())).baseline;
  log(`  baseline (no evaluation): ${report.baseline.toFixed(3)} ns per pixel`);
  for (const field of fields) {
    const kernels = {};
    for (const [name, probe] of Object.entries(FIELD_PROBES.wgsl)) kernels[name] = await kernel(field.wgsl[FIELD_SOURCE[name]], probe);
    const ns = await timeKernels(kernels, fieldParams());
    report.fields.push({ id: field.id, ns });
    log(`  ${field.id.padEnd(16)} ${Object.entries(ns).map(([name, value]) => `${name} ${value.toFixed(2)}`).join('  ')}`);
  }
  for (const preset of presets) {
    const kernels = {};
    for (const name of Object.keys(METRIC_BODIES.wgsl)) kernels[name] = await kernel(preset.ours.wgsl, metricProbe('wgsl', name));
    const ns = await timeKernels(kernels, metricParams(preset.uniforms));
    report.metrics.push({ id: preset.id, ns });
    log(`  ${preset.id.padEnd(24)} ${Object.entries(ns).map(([name, value]) => `${name} ${value.toFixed(2)}`).join('  ')}`);
  }
  device.destroy();
  return report;
}

// ---------------------------------------------------------------------------------------------
// Report

const short = (value) => (Number.isFinite(value) ? String(Number(value.toPrecision(2))) : String(value));
const ns = (value) => value.toPrecision(3);

function table(headers, rows) {
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => `| ${cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`;
  return [line(headers), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

function costTable(label, entries, variants, reference) {
  const headers = [label, ...variants.map((name) => (name === reference ? `${name} (ns)` : `${name} (ns, ×${reference})`))];
  const rows = entries.map(({ id, ns: cost }) => [
    id,
    ...variants.map((name) => (name === reference ? ns(cost[name]) : `${ns(cost[name])} (×${(cost[name] / cost[reference]).toFixed(2)})`)),
  ]);
  return table(headers, rows);
}

const medianMax = (stats) => `${short(stats.median)} / ${short(stats.max)}`;

function markdown(results) {
  const { webgl2, webgpu } = results;
  const parts = [];
  parts.push(`WebGL2 on ${webgl2.renderer}. Timing: ${webgl2.timing}. ${SIZE}×${SIZE} target, ${ITERATIONS} evaluations per pixel per frame, median of ${ROUNDS * FRAMES} frames; ns per pixel (${ITERATIONS} evaluations; ms per frame = ns × ${(PIXELS / 1e6).toFixed(2)}). Baseline (no evaluation): ${ns(webgl2.baseline)} ns.`);
  parts.push(costTable('Field', webgl2.fields, ['value', 'exact', 'fd4', 'fd6'], 'value'));
  parts.push(costTable('Metric preset', webgl2.metrics, ['tensor', 'exact', 'sympy', 'fd'], 'tensor'));
  const fdHeaders = (prefix) => EPSILONS.map((eps) => `${prefix} ε=${eps}`);
  parts.push(`Normal angle error in degrees (median / max over ${POINTS} points):`);
  parts.push(table(['Field', 'exact', ...fdHeaders('fd4'), ...fdHeaders('fd6')], webgl2.precision.fields.map((entry) => [
    entry.id, medianMax(entry.exact.angle), ...EPSILONS.map((eps) => medianMax(entry.fd4[eps].angle)), ...EPSILONS.map((eps) => medianMax(entry.fd6[eps].angle)),
  ])));
  parts.push(`Gradient error relative to 1 + max|ref| (median / max over ${POINTS} points):`);
  parts.push(table(['Field', 'exact', ...fdHeaders('fd4'), ...fdHeaders('fd6')], webgl2.precision.fields.map((entry) => [
    entry.id, medianMax(entry.exact.error), ...EPSILONS.map((eps) => medianMax(entry.fd4[eps].error)), ...EPSILONS.map((eps) => medianMax(entry.fd6[eps].error)),
  ])));
  parts.push(`Metric partials error relative to 1 + max|ref| (median / max over ${POINTS} points):`);
  parts.push(table(['Metric preset', 'exact', 'sympy', ...fdHeaders('fd')], webgl2.precision.metrics.map((entry) => [
    entry.id, medianMax(entry.exact), medianMax(entry.sympy), ...EPSILONS.map((eps) => medianMax(entry.fd[eps])),
  ])));
  if (webgpu.unavailable) {
    parts.push(`WebGPU: skipped (${webgpu.unavailable})`);
  } else {
    parts.push(`WebGPU on ${webgpu.adapter}. Timing: ${webgpu.timing}. Compute shader, same workload. Baseline: ${ns(webgpu.baseline)} ns.`);
    parts.push(costTable('Field', webgpu.fields, ['value', 'exact', 'fd4', 'fd6'], 'value'));
    parts.push(costTable('Metric preset', webgpu.metrics, ['tensor', 'exact', 'fd'], 'tensor'));
  }
  return parts.join('\n\n');
}

async function main() {
  const fixture = await (await fetch('../../test/fixtures/metric-shaders.json')).json();
  const fields = benchmarkFields().map(fieldCase);
  const presets = fixture.presets.map(metricCase);
  const results = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    settings: { size: SIZE, iterations: ITERATIONS, rounds: ROUNDS, frames: FRAMES, dispatches: DISPATCHES, epsilons: EPSILONS, points: POINTS, costEpsilon: COST_EPSILON, unit: 'ns per pixel' },
    fields: fields.map(({ id, expression, derived, domain }) => ({ id, expression, derived, domain: domain ?? [-2, 2] })),
  };
  results.webgl2 = await runWebGl2(fields, presets);
  results.webgpu = await runWebGpu(fields, presets);
  results.markdown = markdown(results);
  reportElement.textContent = results.markdown;
  log('done');
  window.benchResults = { ...results, done: true };
}

main().catch((error) => {
  log(`ERROR ${error.stack ?? error}`);
  logElement.classList.add('fail');
  window.benchResults = { error: String(error), done: true };
});
