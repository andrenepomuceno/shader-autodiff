// Dev-only: runs the GPU pages headless and reports, with no browser window or extension.
//
//   node tools/gpu/check.mjs [--adapter=<GPUn|name>]            GLSL/WGSL and TSL agreement, TSL example
//                                                               self-check; exit 1 on failure
//   node tools/gpu/check.mjs --bench [--adapter=<GPUn|name>] [--query=size=512&dispatches=4]
//                                                               benchmark tables (Markdown) on stdout
//   node tools/gpu/check.mjs --list                             GPUs Chrome can use
import { listAdapters, parseArguments, runPage } from './run.mjs';
import { startServer } from './serve.mjs';

const options = parseArguments(process.argv.slice(2));
const mode = options.positional.find((argument) => /^--(bench|list)$/.test(argument)) ?? '--check';

if (mode === '--list') {
  for (const adapter of await listAdapters(options)) {
    console.log(`GPU${adapter.index}  ${adapter.name}${adapter.active ? '  (default)' : ''}`);
  }
  process.exit(0);
}

const server = await startServer(0);
const root = `http://127.0.0.1:${server.address().port}`;
const base = `${root}/tools/gpu`;
let failed = false;
try {
  if (mode === '--bench') {
    const query = options.positional.find((argument) => argument.startsWith('--query='))?.slice(8) ?? '';
    console.log(await runPage(`${base}/bench.html?${query}`, 'window.benchResults?.done ? window.benchResults.markdown : null', { ...options, timeout: 3600 }));
  } else {
    const agreement = await runPage(`${base}/`, `window.gpuResults?.done ? {
      error: window.gpuResults.error ?? null,
      failures: window.gpuResults.failures ?? [],
      log: document.getElementById('log').textContent,
    } : null`, options);
    console.log(agreement.log);
    const tsl = await runPage(`${base}/tsl.html`, `window.tslResults?.done ? {
      error: window.tslResults.error ?? null,
      failures: window.tslResults.failures ?? [],
      log: document.getElementById('log').textContent,
    } : null`, options);
    console.log(tsl.log);
    const examples = [];
    for (const query of ['check', 'check&webgl']) {
      const example = await runPage(`${root}/examples/tsl/?${query}`, `window.exampleResults?.done ? window.exampleResults : null`, options);
      console.log(example.log);
      for (const failure of example.failures) console.log(`FAIL ${failure}`);
      examples.push(example);
    }
    failed = [agreement, tsl, ...examples].some((result) => result.error || result.failures.length > 0);
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
