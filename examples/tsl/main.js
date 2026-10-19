import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEditor } from '../shared/editor.js';
import { compileSurface, PRESETS, surfaceNodes } from './surface.js';

const FINITE_DIFFERENCE_STEP = 1e-3;
const query = new URLSearchParams(location.search);
const forceWebGL = query.has('webgl');

const elements = Object.fromEntries(
  ['preset', 'source', 'backdrop', 'error', 'a', 'b', 'a-value', 'b-value', 'animate', 'finite', 'wireframe',
    'code', 'code-summary', 'fps', 'backend', 'switch-backend']
    .map((id) => [id, document.getElementById(id)]),
);

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);
await renderer.init();
const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
elements.backend.textContent = backend;
elements['switch-backend'].href = forceWebGL ? '?' : '?webgl';
elements['switch-backend'].textContent = forceWebGL ? 'back to WebGPU' : 'try the WebGL2 fallback';

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3.2, 2.6, 3.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.5;
controls.maxDistance = 15;

const scene = new THREE.Scene();
const hemisphere = new THREE.HemisphereLight();
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 1.5);
scene.add(hemisphere, sun);

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
function applyScheme() {
  const dark = darkScheme.matches;
  scene.background = new THREE.Color(dark ? 0x101318 : 0xe6e9ee);
  hemisphere.color.set(dark ? 0x9fb4d8 : 0xffffff);
  hemisphere.groundColor.set(dark ? 0x1a1410 : 0x6f6a64);
  hemisphere.intensity = dark ? 0.9 : 1.2;
}
applyScheme();
darkScheme.addEventListener('change', applyScheme);

const GEOMETRIES = {
  plane: () => new THREE.PlaneGeometry(4, 4, 256, 256).rotateX(-Math.PI / 2),
  sphere: () => new THREE.SphereGeometry(1, 192, 96),
  box: () => new THREE.BoxGeometry(1.4, 1.4, 1.4, 48, 48, 48),
  bar: () => new THREE.BoxGeometry(4, 0.4, 0.4, 192, 8, 8),
};
const geometries = new Map();
function geometry(base) {
  if (!geometries.has(base)) geometries.set(base, GEOMETRIES[base]());
  return geometries.get(base);
}

const uniforms = { t: TSL.uniform(0), a: TSL.uniform(0.5), b: TSL.uniform(0.5) };
const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide });
material.wireframe = elements.wireframe.checked;
const mesh = new THREE.Mesh(geometry('plane'), material);
mesh.frustumCulled = false;
scene.add(mesh);

let surface = null;

/** Rebuilds the material's nodes; the attributes are the undisplaced geometry in every stage. */
function applySurface() {
  const { position, normal } = surfaceNodes(surface, TSL, {
    position: TSL.positionGeometry,
    normal: TSL.normalGeometry,
    parameters: uniforms,
    epsilon: elements.finite.checked ? FINITE_DIFFERENCE_STEP : 0,
  });
  material.positionNode = position;
  material.normalNode = TSL.normalize(TSL.transformNormalToView(normal)).mul(TSL.faceDirection);
  const shade = surface.mode === 'height' ? TSL.smoothstep(-0.25, 0.3, position.y) : TSL.normalize(normal).y.mul(0.5).add(0.5);
  material.colorNode = TSL.mix(TSL.color(0x3d6fb6), TSL.color(0xe0b25c), shade);
  material.needsUpdate = true;
  mesh.geometry = geometry(surface.base);
  showCode();
}

let codeRequest = 0;
async function showCode() {
  if (!elements.code.closest('details').open) return;
  const request = ++codeRequest;
  try {
    const { fragmentShader } = await renderer.debug.getShaderAsync(scene, camera, mesh);
    if (request !== codeRequest) return;
    const language = backend === 'WebGPU' ? 'WGSL' : 'GLSL';
    elements.code.textContent = fragmentShader;
    elements['code-summary'].textContent = `Generated ${language} fragment shader (${fragmentShader.split('\n').length} lines, by three from the TSL nodes)`;
  } catch (error) {
    if (request === codeRequest) editor.show(`shader build failed: ${error.message}`);
  }
}
elements.code.closest('details').addEventListener('toggle', showCode);

const editor = createEditor({
  source: elements.source,
  backdrop: elements.backdrop,
  error: elements.error,
  onEdit: () => { elements.preset.value = ''; },
}, (text) => {
  surface = compileSurface(text);
  applySurface();
});

const custom = new Option('Custom', '');
custom.hidden = true;
elements.preset.append(custom, ...Object.keys(PRESETS).map((name) => new Option(name, name)));
elements.preset.addEventListener('change', () => {
  if (PRESETS[elements.preset.value]) editor.load(PRESETS[elements.preset.value]);
});

for (const name of ['a', 'b']) {
  const slider = elements[name];
  const sync = () => {
    uniforms[name].value = Number(slider.value);
    elements[`${name}-value`].textContent = uniforms[name].value.toFixed(2);
  };
  slider.addEventListener('input', sync);
  sync();
}

elements.finite.addEventListener('change', () => {
  if (surface) applySurface();
});
elements.wireframe.addEventListener('change', () => {
  material.wireframe = elements.wireframe.checked;
  material.needsUpdate = true;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (window.matchMedia('(max-width: 600px)').matches) document.getElementById('panel').open = false;
elements.preset.value = Object.hasOwn(PRESETS, query.get('preset')) ? query.get('preset') : Object.keys(PRESETS)[0];
editor.load(PRESETS[elements.preset.value]);

if (query.has('check')) {
  const { check } = await import('./check.js');
  try {
    window.exampleResults = await check({ renderer, scene, camera, mesh, uniforms, editor, elements, backend, forceWebGL });
  } catch (error) {
    window.exampleResults = { done: true, failures: [String(error?.stack ?? error)], log: `TSL example (${backend}): error` };
  }
} else {
  let previous = performance.now();
  let frames = 0;
  let fpsStart = previous;
  renderer.setAnimationLoop((now) => {
    if (elements.animate.checked) uniforms.t.value += Math.min(now - previous, 100) / 1000;
    previous = now;
    controls.update();
    renderer.render(scene, camera);

    frames += 1;
    if (now - fpsStart >= 500) {
      elements.fps.textContent = `${Math.round((frames * 1000) / (now - fpsStart))} fps`;
      frames = 0;
      fpsStart = now;
    }
  });
}
