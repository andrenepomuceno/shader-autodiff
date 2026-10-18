// Dev-only: runs a page in a separate headless Chrome through the DevTools protocol and prints a
// value it publishes, so GPU checks run from the command line (no extension, no visible window).
//
//   node tools/gpu/run.mjs <url> <expression> [--adapter=<GPUn|name>] [--chrome=<path>] [--flag=<switch>]... [--timeout=<s>]
//
// <expression> is evaluated in the page until it returns something other than null/undefined.
// --adapter picks the GPU by its chrome://gpu index (GPU0, GPU2, …) or a unique part of its name;
// it is resolved to a LUID at run time because Windows can renumber LUIDs across reboots.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export function parseArguments(argv) {
  const options = { chrome: process.env.CHROME ?? DEFAULT_CHROME, flags: [], timeout: 600, positional: [] };
  for (const argument of argv) {
    const match = /^--(adapter|chrome|flag|timeout)=(.*)$/.exec(argument);
    if (!match) options.positional.push(argument);
    else if (match[1] === 'flag') options.flags.push(match[2]);
    else options[match[1]] = match[1] === 'timeout' ? Number(match[2]) : match[2];
  }
  return options;
}

async function waitForDevTools(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Chrome did not open its DevTools port');
}

function connect(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({ send, close: () => socket.close() }));
    socket.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)));
  });
}

const GPU_INFO = `(() => {
  const text = document.querySelector('info-view')?.shadowRoot?.textContent ?? '';
  // The GPU list renders after the page loads; wait until the active adapter is listed.
  return text.includes('LUID=') && text.includes('*ACTIVE*') ? text : null;
})()`;

/** The GPUs Chrome sees, as listed by chrome://gpu: [{ index, name, luid, active }]. */
export async function listAdapters({ chrome = DEFAULT_CHROME } = {}) {
  return parseAdapters(await runPage('chrome://gpu', GPU_INFO, { chrome, timeout: 60 }));
}

/** Parses the GPU lines of chrome://gpu text into [{ index, name, luid, active }]. */
export function parseAdapters(text) {
  return [...text.matchAll(/GPU(\d+)\s*:VENDOR=[^[]*\[([^\]]+)\][^{]*LUID=\{(\d+),(\d+)\}([^G]*?\*ACTIVE\*)?/g)]
    .map(([, index, name, high, low, active]) => ({ index: Number(index), name, luid: `${high},${low}`, active: Boolean(active) }));
}

const resolved = new Map();

export async function resolveAdapter(spec, options) {
  if (resolved.has(spec)) return resolved.get(spec);
  const adapters = await listAdapters(options);
  const byIndex = /^GPU(\d+)$/i.exec(spec);
  const matches = byIndex
    ? adapters.filter((adapter) => adapter.index === Number(byIndex[1]))
    : adapters.filter((adapter) => adapter.name.toLowerCase().includes(spec.toLowerCase()));
  const listing = adapters.map((adapter) => `GPU${adapter.index} ${adapter.name}`).join(', ');
  if (matches.length !== 1) throw new Error(`adapter '${spec}' matches ${matches.length} of: ${listing}; use GPUn`);
  resolved.set(spec, matches[0]);
  return matches[0];
}

export async function runPage(url, expression, { chrome = DEFAULT_CHROME, flags = [], timeout = 600, adapter } = {}) {
  if (adapter) {
    const { luid } = await resolveAdapter(adapter, { chrome });
    flags = [...flags, `--use-adapter-luid=${luid}`];
  }
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'shader-autodiff-chrome-'));
  const browser = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', ...flags, 'about:blank',
  ], { stdio: 'ignore' });
  const deadline = Date.now() + timeout * 1000;
  try {
    await waitForDevTools(port, deadline);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const page = await connect(target.webSocketDebuggerUrl);
    try {
      // The target starts on an empty document; evaluate only once the requested page has loaded.
      const loaded = `location.href !== 'about:blank' && document.readyState === 'complete'`;
      while (!(await page.send('Runtime.evaluate', { expression: loaded, returnByValue: true })).result.value) {
        if (Date.now() > deadline) throw new Error(`timed out loading ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      while (Date.now() < deadline) {
        const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        if (result.value !== undefined && result.value !== null) return result.value;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(`timed out after ${timeout} s waiting for ${expression}`);
    } finally {
      page.close();
    }
  } finally {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      // Chrome's helper processes can hold the profile a little longer; it is only a temp folder.
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positional: [url, expression], ...options } = parseArguments(process.argv.slice(2));
  if (!url || !expression) {
    console.error('usage: node tools/gpu/run.mjs <url> <expression> [--flag=<switch>]... [--timeout=<s>]');
    process.exit(2);
  }
  const value = await runPage(url, expression, options);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
