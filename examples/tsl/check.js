// Self-check behind `?check` (run headless by tools/gpu/check.mjs): renders every preset into a small
// target with exact and with finite-difference normals and compares the images. Both must cover the
// screen and agree up to the FD rounding, the requested backend must be the one running, and nothing
// may be logged to console.error or console.warn (index.html records them from the page's start).
import * as THREE from 'three/webgpu';
import { PRESETS } from './surface.js';

// 128 RGBA8 pixels are 512 bytes, so WebGPU's 256-byte row alignment adds no padding to the readback.
const SIZE = 128;
const MIN_COVERAGE = 0.05;
const MAX_MEAN_DIFFERENCE = 1.5;

export async function check({ renderer, scene, camera, mesh, uniforms, editor, elements, backend, forceWebGL }) {
  const target = new THREE.RenderTarget(SIZE, SIZE);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  elements.animate.checked = false;
  uniforms.t.value = 0.7;

  const snapshot = async () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, SIZE, SIZE);
    if (pixels.length !== SIZE * SIZE * 4) throw new Error(`readback of ${pixels.length} values, expected ${SIZE * SIZE * 4}`);
    return pixels;
  };
  const setFinite = (on) => {
    elements.finite.checked = on;
    elements.finite.dispatchEvent(new Event('change'));
  };

  const lines = [];
  const failures = [];
  // WebGPURenderer falls back to WebGL2 silently; a WebGPU run must really be WebGPU.
  if (!forceWebGL && backend !== 'WebGPU') {
    failures.push(navigator.gpu ? 'WebGPU is available but the renderer fell back to WebGL2' : 'no WebGPU (navigator.gpu missing)');
  }
  for (const [name, text] of Object.entries(PRESETS)) {
    if (!editor.load(text)) {
      failures.push(`${name}: ${elements.error.textContent}`);
      continue;
    }
    setFinite(false);
    const exact = await snapshot();
    setFinite(true);
    const finite = await snapshot();
    mesh.visible = false;
    const background = await snapshot();
    mesh.visible = true;

    let covered = 0;
    let difference = 0;
    for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) {
      let changed = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const k = pixel * 4 + channel;
        if (Math.abs(exact[k] - background[k]) > 8) changed = true;
        difference += Math.abs(exact[k] - finite[k]);
      }
      if (changed) covered += 1;
    }
    const coverage = covered / (SIZE * SIZE);
    const mean = difference / Math.max(1, covered * 3);
    lines.push(`${name}: coverage ${(100 * coverage).toFixed(0)} %, exact vs FD normals ${mean.toFixed(2)}/255`);
    if (!(coverage >= MIN_COVERAGE)) failures.push(`${name}: the surface covers ${(100 * coverage).toFixed(1)} % of the image`);
    if (!(mean <= MAX_MEAN_DIFFERENCE)) failures.push(`${name}: exact and FD shading differ by ${mean.toFixed(2)}/255 on average`);
  }
  setFinite(false);
  failures.push(...(window.checkLog ?? []).map((message) => `console: ${message}`));
  const log = `TSL example (${backend}): ${Object.keys(PRESETS).length} presets\n${lines.join('\n')}`;
  return { done: true, failures, log };
}
