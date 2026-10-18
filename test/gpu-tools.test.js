import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdapters, parseArguments } from '../tools/gpu/run.mjs';

const CHROME_GPU = 'Sandboxed                       :true'
  + 'GPU0                            :VENDOR= 0x10de, DEVICE=0x2d04 [NVIDIA GeForce RTX 5060 Ti], SUBSYS=0x1440196e, REV=161, LUID={0,80739}, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=32.0.16.1088 *ACTIVE*'
  + 'GPU1                            :VENDOR= 0x8086, DEVICE=0xa780 [Intel(R) UHD Graphics 770], SUBSYS=0x7e061462, REV=4, LUID={0,90916}, DRIVER_VERSION=32.0.101.7088'
  + 'GPU2                            :VENDOR= 0x10de, DEVICE=0x2d04 [NVIDIA GeForce RTX 5060 Ti], SUBSYS=0x1440196e, REV=161, LUID={0,86336}, DRIVER_VERSION=32.0.16.1088'
  + 'Optimus                         :false';

test('chrome://gpu adapters are parsed with their LUIDs and the active one', () => {
  assert.deepEqual(parseAdapters(CHROME_GPU), [
    { index: 0, name: 'NVIDIA GeForce RTX 5060 Ti', luid: '0,80739', active: true },
    { index: 1, name: 'Intel(R) UHD Graphics 770', luid: '0,90916', active: false },
    { index: 2, name: 'NVIDIA GeForce RTX 5060 Ti', luid: '0,86336', active: false },
  ]);
});

test('runner arguments', () => {
  const options = parseArguments(['http://x/', 'expr', '--adapter=GPU2', '--flag=--a', '--flag=--b', '--timeout=30', '--bench']);
  assert.deepEqual(options.positional, ['http://x/', 'expr', '--bench']);
  assert.equal(options.adapter, 'GPU2');
  assert.deepEqual(options.flags, ['--a', '--b']);
  assert.equal(options.timeout, 30);
});
