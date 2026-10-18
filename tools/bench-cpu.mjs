// CPU benchmarks: compile time per field and metric preset, JS evaluation throughput (interpreter
// and emitted function) and emitted GLSL size against the sympy compiler. Prints Markdown.
//   node tools/bench-cpu.mjs
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { compile } from '../src/index.js';
import { compileMetric } from '../examples/metric-shaders/metric.js';
import { benchmarkFields, random } from './gpu/cases.js';

const COMPILE_RUNS = 50;
const EVALUATE_MIN_MS = 300;
const OPTIONS = { variables: ['x', 'y', 'z'], parameters: ['a', 'b', 't'] };
const RENAMES = { parameters: { a: 'u_a', b: 'u_b', t: 'u_t' } };

const fixture = JSON.parse(readFileSync(new URL('../test/fixtures/metric-shaders.json', import.meta.url), 'utf8'));

function medianMs(fn) {
  for (let i = 0; i < 5; i += 1) fn();
  const times = [];
  for (let i = 0; i < COMPILE_RUNS; i += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[COMPILE_RUNS >> 1];
}

/**
 * Evaluations per second of `fn(env)`; `consume` reads the result so nothing is dead. The loop is
 * generated per measurement so every function gets its own (monomorphic) call site in V8.
 */
function throughput(fn, envs, consume) {
  const loop = new Function('fn', 'envs', 'consume', 'minMs', `
    let sink = 0;
    let count = 0;
    for (let i = 0; i < 2000; i += 1) sink += consume(fn(envs[i % envs.length]));
    const start = performance.now();
    let elapsed = 0;
    while (elapsed < minMs) {
      for (let i = 0; i < 10000; i += 1) sink += consume(fn(envs[i % envs.length]));
      count += 10000;
      elapsed = performance.now() - start;
    }
    if (Number.isNaN(sink)) throw new Error('evaluation produced NaN');
    return count / (elapsed / 1000);`);
  return loop(fn, envs, consume, EVALUATE_MIN_MS);
}

const consumeGradient = ({ value, gradient }) => value + gradient[0] + gradient[1] + gradient[2];
const consumeHessian = (result) => consumeGradient(result) + result.hessian[0][0] + result.hessian[0][1] + result.hessian[1][2] + result.hessian[2][2];

function table(headers, rows) {
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => `| ${cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`;
  return [line(headers), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

const ms = (value) => value.toFixed(3);
const millions = (value) => (value / 1e6).toFixed(1);
const thousands = (value) => (value / 1e3).toFixed(0);

function benchmarkFieldsCpu() {
  const next = random(2031);
  const envs = Array.from({ length: 64 }, () => ({ x: -2 + 4 * next(), y: -2 + 4 * next(), z: -2 + 4 * next(), a: 0.5, b: 0.5, t: 1.25 }));
  const compileRows = [];
  const evaluateRows = [];
  for (const field of benchmarkFields()) {
    const options = { ...OPTIONS, derived: field.derived ?? {} };
    const gradient = compile(field.expression, { ...options, order: 1 });
    const hessian = compile(field.expression, { ...options, order: 2 });
    compileRows.push([
      field.id,
      ms(medianMs(() => compile(field.expression, { ...options, order: 1 }))),
      ms(medianMs(() => gradient.glsl('f', RENAMES))),
      ms(medianMs(() => compile(field.expression, { ...options, order: 2 }))),
      gradient.glsl('f', RENAMES).split('\n').length,
    ]);
    const emitted = (compiled) => new Function(`${compiled.js('f')}; return f;`)();
    evaluateRows.push([
      field.id,
      thousands(throughput(gradient.evaluate, envs, consumeGradient)),
      millions(throughput(emitted(gradient), envs, consumeGradient)),
      thousands(throughput(hessian.evaluate, envs, consumeHessian)),
      millions(throughput(emitted(hessian), envs, consumeHessian)),
    ]);
  }
  return { compileRows, evaluateRows };
}

function benchmarkPresets() {
  return fixture.presets.map((preset) => {
    const spec = { kind: preset.kind, components: preset.components };
    const { glsl } = compileMetric(spec);
    const lines = (source) => source.split('\n').length;
    return [
      preset.id,
      ms(medianMs(() => compileMetric(spec))),
      `${glsl.length} B, ${lines(glsl)} lines`,
      `${preset.glsl.length} B, ${lines(preset.glsl)} lines`,
      (glsl.length / preset.glsl.length).toFixed(2),
    ];
  });
}

const { compileRows, evaluateRows } = benchmarkFieldsCpu();
console.log(`Node ${process.version} on ${cpus()[0].model.trim()}, ${new Date().toISOString().slice(0, 10)}. Compile times are medians of ${COMPILE_RUNS} runs; throughput is over ≥ ${EVALUATE_MIN_MS} ms of evaluations at 64 random points.\n`);
console.log(table(['Field', 'compile, gradient (ms)', 'emit GLSL (ms)', 'compile, Hessian (ms)', 'GLSL lines (gradient)'], compileRows));
console.log();
console.log(table(['Field', 'evaluate (k/s)', 'emitted JS (M/s)', 'evaluate + Hessian (k/s)', 'emitted JS + Hessian (M/s)'], evaluateRows));
console.log();
console.log(table(['Metric preset', 'compileMetric (ms)', 'GLSL ours', 'GLSL sympy', 'ours / sympy'], benchmarkPresets()));
