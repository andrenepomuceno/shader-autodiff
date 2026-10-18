import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const UPDATE = process.env.UPDATE_GOLDEN === '1';

/** Compares `actual` with test/golden/<file>; UPDATE_GOLDEN=1 (or a missing file) rewrites it. */
export function golden(file, actual) {
  const url = new URL(`../golden/${file}`, import.meta.url);
  if (UPDATE || !existsSync(url)) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, 'utf8'), `${file} differs (UPDATE_GOLDEN=1 to accept)`);
}
