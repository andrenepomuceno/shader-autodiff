import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the package resolves by name and exports what the declarations declare', async () => {
  const runtime = await import('shader-autodiff');
  const declarations = readFileSync(new URL('../types/index.d.ts', import.meta.url), 'utf8');
  const declared = [...declarations.matchAll(/^export (?:function|const|class) (\w+)/gm)].map((match) => match[1]);
  assert.deepEqual([...new Set(declared)].sort(), Object.keys(runtime).sort());
});

test('package metadata points at shipped files', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.exports['.'].default, './src/index.js');
  assert.equal(pkg.exports['.'].types, './types/index.d.ts');
  assert.equal(pkg.license, 'MIT');
  assert.deepEqual(pkg.files, ['src', 'types/index.d.ts']);
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
});
