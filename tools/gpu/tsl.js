import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { compile } from '../../src/index.js';
import { EXPRESSIONS, groupError, random, randomExpression } from './cases.js';

const TOLERANCE = 1e-3;
const SAMPLES = 6;
const OUTPUTS = 13;
const logElement = document.getElementById('log');
const lines = [];
const log = (text) => {
  lines.push(text);
  logElement.textContent = lines.join('\n');
};

function cases() {
  const next = random(2027);
  const texts = [...EXPRESSIONS, ...Array.from({ length: 30 }, () => randomExpression(next, 4))];
  return texts.map((text) => {
    const compiled = compile(text, { variables: ['x', 'y', 'z'], parameters: ['a', 'b'], order: 2 });
    const envs = Array.from({ length: SAMPLES }, () => Object.fromEntries([
      ['x', 0.3 + 2 * next()], ['y', 0.3 + 2 * next()], ['z', 0.3 + 2 * next()], ['a', next()], ['b', 0.5 + next()],
    ].map(([name, value]) => [name, Math.fround(value)])));
    return { text, compiled, envs };
  });
}

/** Runs the value, gradient (vec3 node) and Hessian (mat3 node) of one expression for every sample. */
async function runCase(renderer, { compiled, envs }) {
  // Few, packed buffers: WebGPU allows 8 storage buffers per stage, and the WebGL2 fallback runs
  // compute through transform feedback, where only two vec4 outputs per dispatch came back reliably.
  const first = TSL.attributeArray(new Float32Array(envs.flatMap((env) => [env.x, env.y, env.z, env.a])), 'vec4');
  const second = TSL.attributeArray(new Float32Array(envs.flatMap((env) => [env.b, 0, 0, 0])), 'vec4');
  const outputs = Array.from({ length: Math.ceil(OUTPUTS / 4) }, () => TSL.attributeArray(SAMPLES, 'vec4'));

  const kernel = (group) => TSL.Fn(() => {
    const i = TSL.instanceIndex;
    const input = first.element(i);
    const { value, gradient, hessian } = compiled.tsl(TSL, {
      inputs: input.xyz,
      parameters: { a: input.w, b: second.element(i).x },
    });
    // H·e_j is column j of the Hessian.
    const columns = [TSL.vec3(1, 0, 0), TSL.vec3(0, 1, 0), TSL.vec3(0, 0, 1)].map((axis) => hessian.mul(axis));
    const results = [value, gradient.x, gradient.y, gradient.z];
    for (let row = 0; row < 3; row += 1) for (let j = 0; j < 3; j += 1) results.push(columns[j][['x', 'y', 'z'][row]]);
    while (results.length % 4) results.push(TSL.float(0));
    for (const k of group) outputs[k].element(i).assign(TSL.vec4(...results.slice(k * 4, k * 4 + 4)));
  });

  await renderer.computeAsync(kernel([0, 1])().compute(SAMPLES));
  await renderer.computeAsync(kernel([2, 3])().compute(SAMPLES));
  const chunks = [];
  for (const output of outputs) chunks.push(new Float32Array(await renderer.getArrayBufferAsync(output.value)));
  let worst = 0;
  envs.forEach((env, index) => {
    const { value, gradient, hessian } = compiled.evaluate(env);
    const actual = chunks.flatMap((chunk) => Array.from(chunk.slice(index * 4, index * 4 + 4))).slice(0, OUTPUTS);
    worst = Math.max(
      worst,
      groupError(actual.slice(0, 1), [value]),
      groupError(actual.slice(1, 4), gradient),
      groupError(actual.slice(4, 13), hessian.flat()),
    );
  });
  return worst;
}

async function createRenderer(forceWebGL) {
  const renderer = new THREE.WebGPURenderer({ forceWebGL });
  await renderer.init();
  return renderer;
}

async function runBackend(name, forceWebGL, allCases) {
  let renderer = await createRenderer(forceWebGL);
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const failures = [];
  let worst = { error: 0, text: '' };
  for (const testCase of allCases) {
    // three r180's WebGL2 fallback reuses a compute program with identical code but keeps the first
    // run's buffers, so later runs read back zeros; a fresh renderer per case sidesteps it.
    if (backend === 'WebGL2') {
      renderer.dispose();
      renderer = await createRenderer(forceWebGL);
    }
    const error = await runCase(renderer, testCase);
    if (!(error <= TOLERANCE)) failures.push(`${name}: ${testCase.text}: ${error}`);
    if (!(error <= worst.error)) worst = { error, text: testCase.text };
  }
  log(`${name} (${backend} backend): ${allCases.length} expressions, worst ${worst.error.toExponential(2)}: ${worst.text}`);
  renderer.dispose();
  return failures;
}

async function main() {
  const allCases = cases();
  const failures = [];
  if (navigator.gpu) failures.push(...await runBackend('WebGPURenderer', false, allCases));
  else log('WebGPURenderer: skipped (navigator.gpu missing)');
  failures.push(...await runBackend('WebGPURenderer forceWebGL', true, allCases));
  log(failures.length ? `FAIL\n${failures.join('\n')}` : `PASS (tolerance ${TOLERANCE})`);
  if (failures.length) logElement.classList.add('fail');
  window.tslResults = { failures, done: true };
}

main().catch((error) => {
  log(`ERROR ${error.stack ?? error}`);
  logElement.classList.add('fail');
  window.tslResults = { error: String(error), done: true };
});
