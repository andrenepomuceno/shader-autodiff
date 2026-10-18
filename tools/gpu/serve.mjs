// Dev-only static server for the GPU harness: node tools/gpu/serve.mjs [port], then open
// http://127.0.0.1:<port>/tools/gpu/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.argv[2] ?? 8137);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

createServer(async (request, response) => {
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  if (request.method !== 'GET' || !file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`GPU harness at http://127.0.0.1:${PORT}/tools/gpu/`));
