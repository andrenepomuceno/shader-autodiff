import { compile } from '../../src/index.js';
import { compileMetric } from '../../examples/metric-shaders/metric.js';
import { EXPRESSIONS, groupError, random, randomExpression } from './cases.js';

const TOLERANCE = 1e-3;
const logElement = document.getElementById('log');
const lines = [];
const log = (text) => {
  lines.push(text);
  logElement.textContent = lines.join('\n');
};

// ---------------------------------------------------------------------------------------------
// WebGL2: every sample is drawn into a 1×1 RGBA32F target, four values per pass.

function createGl() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, 1, 1);
  return gl;
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

function glslProgram(gl, functions, uniforms, body, count) {
  const padded = Math.ceil(count / 4) * 4;
  const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 u_point;
uniform int u_group;
${uniforms.map((name) => `uniform ${name};`).join('\n')}
out vec4 color;
${functions}
void main() {
    float v[${padded}];
    for (int i = 0; i < ${padded}; i++) v[i] = 0.0;
${body}
    int k = u_group * 4;
    color = vec4(v[k], v[k + 1], v[k + 2], v[k + 3]);
}`;
  const vertex = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }`;
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link error: ${gl.getProgramInfoLog(program)}`);
  return (setUniforms) => {
    gl.useProgram(program);
    const location = (name) => gl.getUniformLocation(program, name);
    setUniforms(gl, location);
    const values = [];
    const pixel = new Float32Array(4);
    for (let group = 0; group < padded / 4; group += 1) {
      gl.uniform1i(location('u_group'), group);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
      values.push(...pixel);
    }
    return values.slice(0, count);
  };
}

const METRIC_GLSL_BODY = `
    mat3 g = metricTensor(u_point);
    mat3 dx;
    mat3 dy;
    mat3 dz;
    metricPartials(u_point, dx, dy, dz);
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            v[i * 3 + j] = g[j][i];
            v[9 + i * 3 + j] = dx[j][i];
            v[18 + i * 3 + j] = dy[j][i];
            v[27 + i * 3 + j] = dz[j][i];
        }
    }`;

const EXPRESSION_GLSL_BODY = `
    vec3 gradient;
    mat3 hessian;
    v[0] = f(u_point, gradient, hessian);
    for (int i = 0; i < 3; i++) {
        v[1 + i] = gradient[i];
        for (int j = 0; j < 3; j++) v[4 + i * 3 + j] = hessian[j][i];
    }`;

const METRIC_UNIFORMS = ['vec4 u_params', 'float u_time', 'float u_morph'];

function setMetricUniforms(point, uniforms) {
  return (gl, location) => {
    gl.uniform3f(location('u_point'), ...point);
    gl.uniform4f(location('u_params'), uniforms.a, uniforms.b, uniforms.c, uniforms.d);
    gl.uniform1f(location('u_time'), uniforms.t);
    gl.uniform1f(location('u_morph'), uniforms.s);
  };
}

const flattenMetric = (sample) => [sample.metric, ...sample.partials].flatMap((matrix) => matrix.flat());
const metricGroups = (values) => [0, 1, 2, 3].map((index) => values.slice(index * 9, index * 9 + 9));
const flattenExpression = ({ value, gradient, hessian }) => [value, ...gradient, ...hessian.flat()];
const expressionGroups = (values) => [values.slice(0, 1), values.slice(1, 4), values.slice(4, 13)];

function worst(pairs) {
  return Math.max(...pairs.flatMap(([actual, expected, groups]) => groups(actual).map((group, index) => groupError(group, groups(expected)[index]))));
}

async function loadFixture() {
  const response = await fetch('../../test/fixtures/metric-shaders.json');
  return response.json();
}

function expressionCases() {
  const next = random(2026);
  const texts = [...EXPRESSIONS, ...Array.from({ length: 40 }, () => randomExpression(next, 4))];
  return texts.map((text) => {
    const compiled = compile(text, { variables: ['x', 'y', 'z'], parameters: ['a', 'b'], order: 2 });
    const samples = Array.from({ length: 6 }, () => {
      const env = Object.fromEntries([
        ['x', 0.3 + 2 * next()], ['y', 0.3 + 2 * next()], ['z', 0.3 + 2 * next()], ['a', next()], ['b', 0.5 + next()],
      ].map(([name, value]) => [name, Math.fround(value)]));
      return { env, expected: flattenExpression(compiled.evaluate(env)) };
    });
    return { text, compiled, samples };
  });
}

function runWebGl(fixture, cases) {
  const gl = createGl();
  const report = { renderer: gl.getParameter(gl.RENDERER), metrics: [], expressions: [] };
  for (const preset of fixture.presets) {
    const ours = glslProgram(gl, compileMetric(preset).glsl, METRIC_UNIFORMS, METRIC_GLSL_BODY, 36);
    const sympy = glslProgram(gl, preset.glsl, METRIC_UNIFORMS, METRIC_GLSL_BODY, 36);
    const oursPairs = [];
    const sympyPairs = [];
    for (const sample of preset.samples) {
      const expected = flattenMetric(sample);
      oursPairs.push([ours(setMetricUniforms(sample.point, sample.uniforms)), expected, metricGroups]);
      sympyPairs.push([sympy(setMetricUniforms(sample.point, sample.uniforms)), expected, metricGroups]);
    }
    report.metrics.push({ id: preset.id, ours: worst(oursPairs), sympy: worst(sympyPairs) });
  }
  for (const { text, compiled, samples } of cases) {
    const run = glslProgram(gl, compiled.glsl('f'), ['float a', 'float b'], EXPRESSION_GLSL_BODY, 13);
    const pairs = samples.map(({ env, expected }) => [run((context, location) => {
      context.uniform3f(location('u_point'), env.x, env.y, env.z);
      context.uniform1f(location('a'), env.a);
      context.uniform1f(location('b'), env.b);
    }), expected, expressionGroups]);
    report.expressions.push({ text, error: worst(pairs) });
  }
  return report;
}

// ---------------------------------------------------------------------------------------------
// WebGPU: one compute invocation per sample; parameters live in private module-scope variables.

async function runWgslKernel(device, { functions, privates, setup, body, inputs, inputSize, outputSize }) {
  const count = inputs.length / inputSize;
  const code = `
@group(0) @binding(0) var<storage, read> inputs: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<f32>;
${privates.map((declaration) => `var<private> ${declaration};`).join('\n')}
${functions}
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x * ${inputSize}u;
    let o = id.x * ${outputSize}u;
    let point = vec3<f32>(inputs[i], inputs[i + 1u], inputs[i + 2u]);
${setup}
${body}
}`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === 'error');
  if (errors.length) throw new Error(`WGSL error: ${errors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('; ')}\n${code}`);
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const input = device.createBuffer({ size: inputs.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(input, 0, inputs);
  const outputBytes = count * outputSize * 4;
  const output = device.createBuffer({ size: outputBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: outputBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } }],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(count);
  pass.end();
  encoder.copyBufferToBuffer(output, 0, readback, 0, outputBytes);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(readback.getMappedRange()));
  readback.unmap();
  return Array.from({ length: count }, (_, index) => values.slice(index * outputSize, (index + 1) * outputSize));
}

const METRIC_WGSL_BODY = `
    let g = metricTensor(point);
    var dx: mat3x3<f32>;
    var dy: mat3x3<f32>;
    var dz: mat3x3<f32>;
    metricPartials(point, &dx, &dy, &dz);
    for (var r = 0u; r < 3u; r++) {
        for (var c = 0u; c < 3u; c++) {
            outputs[o + r * 3u + c] = g[c][r];
            outputs[o + 9u + r * 3u + c] = dx[c][r];
            outputs[o + 18u + r * 3u + c] = dy[c][r];
            outputs[o + 27u + r * 3u + c] = dz[c][r];
        }
    }`;

const EXPRESSION_WGSL_BODY = `
    var gradient: vec3<f32>;
    var hessian: mat3x3<f32>;
    outputs[o] = f(point, &gradient, &hessian);
    for (var r = 0u; r < 3u; r++) {
        outputs[o + 1u + r] = gradient[r];
        for (var c = 0u; c < 3u; c++) {
            outputs[o + 4u + r * 3u + c] = hessian[c][r];
        }
    }`;

async function runWebGpu(fixture, cases) {
  if (!navigator.gpu) return { unavailable: 'navigator.gpu missing' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { unavailable: 'no adapter' };
  const device = await adapter.requestDevice();
  const report = { adapter: adapter.info?.description || adapter.info?.vendor || 'unknown', metrics: [], expressions: [] };
  for (const preset of fixture.presets) {
    const inputs = new Float32Array(preset.samples.flatMap(({ point, uniforms: u }) => [...point, u.a, u.b, u.c, u.d, u.t, u.s]));
    const results = await runWgslKernel(device, {
      functions: compileMetric(preset).wgsl,
      privates: ['u_params: vec4<f32>', 'u_time: f32', 'u_morph: f32'],
      setup: `    u_params = vec4<f32>(inputs[i + 3u], inputs[i + 4u], inputs[i + 5u], inputs[i + 6u]);
    u_time = inputs[i + 7u];
    u_morph = inputs[i + 8u];`,
      body: METRIC_WGSL_BODY,
      inputs,
      inputSize: 9,
      outputSize: 36,
    });
    report.metrics.push({ id: preset.id, ours: worst(results.map((values, index) => [values, flattenMetric(preset.samples[index]), metricGroups])) });
  }
  for (const { text, compiled, samples } of cases) {
    const inputs = new Float32Array(samples.flatMap(({ env }) => [env.x, env.y, env.z, env.a, env.b]));
    const results = await runWgslKernel(device, {
      functions: compiled.wgsl('f'),
      privates: ['a: f32', 'b: f32'],
      setup: '    a = inputs[i + 3u];\n    b = inputs[i + 4u];',
      body: EXPRESSION_WGSL_BODY,
      inputs,
      inputSize: 5,
      outputSize: 13,
    });
    report.expressions.push({ text, error: worst(results.map((values, index) => [values, samples[index].expected, expressionGroups])) });
  }
  return report;
}

function summarize(name, report) {
  if (report.unavailable) {
    log(`${name}: skipped (${report.unavailable})`);
    return [];
  }
  const failures = [];
  log(`${name} on ${report.renderer ?? report.adapter}`);
  for (const metric of report.metrics) {
    const sympy = metric.sympy === undefined ? '' : `  sympy ${metric.sympy.toExponential(2)}`;
    log(`  metric ${metric.id.padEnd(24)} ours ${metric.ours.toExponential(2)}${sympy}`);
    if (!(metric.ours <= TOLERANCE)) failures.push(`${name} metric ${metric.id}: ${metric.ours}`);
  }
  const worstExpression = report.expressions.reduce((a, b) => (b.error > a.error || Number.isNaN(b.error) ? b : a));
  log(`  ${report.expressions.length} expressions, worst ${worstExpression.error.toExponential(2)}: ${worstExpression.text}`);
  for (const expression of report.expressions) {
    if (!(expression.error <= TOLERANCE)) failures.push(`${name} expression ${expression.text}: ${expression.error}`);
  }
  return failures;
}

async function main() {
  const fixture = await loadFixture();
  const cases = expressionCases();
  const webgl2 = runWebGl(fixture, cases);
  const webgpu = await runWebGpu(fixture, cases);
  const failures = [...summarize('WebGL2', webgl2), ...summarize('WebGPU', webgpu)];
  log(failures.length ? `FAIL\n${failures.join('\n')}` : `PASS (tolerance ${TOLERANCE})`);
  if (failures.length) logElement.classList.add('fail');
  window.gpuResults = { webgl2, webgpu, failures, done: true };
}

main().catch((error) => {
  log(`ERROR ${error.stack ?? error}`);
  logElement.classList.add('fail');
  window.gpuResults = { error: String(error), done: true };
});
