import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { compile, ExpressionError } from '../../src/index.js';
import { createEditor, inEditor, readSource } from '../shared/editor.js';

const PRESETS = {
  'Twisted torus ∪ ball': `// a: twist, b: blend radius
q = 2*a*x + 0.5*t
yr = y*cos(q) - z*sin(q)
zr = y*sin(q) + z*cos(q)
torus = max(abs(sqrt(x^2 + zr^2) - 1), abs(yr)) - 0.2
ball = sqrt(x^2 + (y - 0.7*sin(t))^2 + z^2) - 0.55
k = 0.05 + 0.5*b
h = clamp(0.5 + 0.5*(ball - torus)/k, 0, 1)
mix(ball, torus, h) - k*h*(1 - h)`,

  'Gyroid ball': `// a: frequency, b: shell thickness
k = 4 + 4*a
g = sin(k*x + t)*cos(k*y) + sin(k*y)*cos(k*z) + sin(k*z)*cos(k*x + t)
shell = abs(g)/k - 0.01 - 0.06*b
max(shell, sqrt(x^2 + y^2 + z^2) - 1.2)`,

  'Orbiting blobs': `// a: size, b: blend (log-sum-exp smooth union)
r = 0.3 + 0.3*a
s1 = sqrt((x - cos(t))^2 + y^2 + (z - sin(t))^2) - r
s2 = sqrt((x + cos(t))^2 + (y - 0.5*sin(1.3*t))^2 + (z + sin(t))^2) - r
s3 = sqrt(x^2 + (y - 0.8*cos(0.7*t))^2 + z^2) - r
k = 2 + 14*(1 - b)
-log(exp(-k*s1) + exp(-k*s2) + exp(-k*s3))/k`,

  'Twisted column': `// a: twist rate, b: rounding
q = (1 + 2*a)*y + t
xr = x*cos(q) - z*sin(q)
zr = x*sin(q) + z*cos(q)
max(max(abs(xr), abs(zr)) - 0.45 + 0.2*b, abs(y) - 1.2) - 0.2*b`,

  'Rippled disc': `// a: wave height, b: wave frequency; not a distance (Lipschitz ≈ 4)
amp = 0.05 + 0.3*a
w = 3 + 5*b
top = y - amp*sin(w*x + 2*t)*cos(w*z + t)
max(max(top, -y - 0.4), sqrt(x^2 + z^2) - 1.6)`,

  Superellipsoid: `// a: exponent from 1.5 (pointy) to 8 (boxy)
n = 1.5 + 6.5*a
(abs(x)^n + abs(y/(0.8 + 0.4*b))^n + abs(z)^n)^(1/n) - 1`,
};

const elements = Object.fromEntries(
  ['preset', 'source', 'backdrop', 'error', 'a', 'b', 'a-value', 'b-value', 'animate', 'finite', 'code', 'code-summary', 'fps']
    .map((id) => [id, document.getElementById(id)]),
);

function buildShaders(text) {
  const read = readSource(text);
  if (read.expression === null) throw new ExpressionError('the last line must be the expression f(x, y, z)', { start: text.length });
  const options = { variables: ['x', 'y', 'z'], parameters: ['t', 'a', 'b'], derived: read.definitions };
  const uniforms = { parameters: { t: 'uTime', a: 'uA', b: 'uB' } };
  return inEditor(read, () => ({
    sdf: compile(read.expression, { ...options, order: 1 }).glsl('sdf', uniforms),
    sdfValue: compile(read.expression, { ...options, order: 0 }).glsl('sdfValue', uniforms),
  }));
}

const vertexShader = /* glsl */ `
out vec2 vNdc;

void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = ({ sdf, sdfValue }) => /* glsl */ `
uniform float uTime;
uniform float uA;
uniform float uB;
uniform mat4 uCameraWorld;
uniform mat4 uProjectionInverse;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;

in vec2 vNdc;
out vec4 fragColor;

${sdf}
${sdfValue}

const int MAX_STEPS = 200;
const float MAX_DISTANCE = 30.0;

vec3 background(vec3 direction) {
  return mix(uSkyBottom, uSkyTop, 0.5 + 0.5 * direction.y);
}

vec3 normalAt(vec3 p, vec3 gradient) {
#ifdef FINITE_DIFFERENCES
  const vec2 e = vec2(1e-3, 0.0);
  return normalize(vec3(
    sdfValue(p + e.xyy) - sdfValue(p - e.xyy),
    sdfValue(p + e.yxy) - sdfValue(p - e.yxy),
    sdfValue(p + e.yyx) - sdfValue(p - e.yyx)));
#else
  return normalize(gradient);
#endif
}

float occlusion(vec3 p, vec3 n) {
  float occluded = 0.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.06 * float(i);
    occluded += (h - sdfValue(p + n * h)) / float(i);
  }
  return clamp(1.0 - 2.5 * occluded, 0.0, 1.0);
}

void main() {
  vec4 view = uProjectionInverse * vec4(vNdc, 1.0, 1.0);
  vec3 direction = normalize(mat3(uCameraWorld) * (view.xyz / view.w));
  vec3 origin = cameraPosition;

  float travelled = 0.0;
  vec3 gradient = vec3(0.0);
  bool hit = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    float f = sdf(origin + direction * travelled, gradient);
    // The expression need not be a true distance (Lipschitz constant above 1, e.g. twists or
    // ripples). f / |grad f| is a first-order distance estimate that keeps the march from
    // tunnelling through the surface, and it is free here because sdf() returns the exact gradient.
    float stepLength = f / max(1.0, length(gradient));
    if (abs(stepLength) < 2e-4 * (1.0 + travelled)) {
      hit = true;
      break;
    }
    travelled += stepLength;
    if (travelled > MAX_DISTANCE) break;
  }

  vec3 color = background(direction);
  if (hit) {
    vec3 p = origin + direction * travelled;
    vec3 n = normalAt(p, gradient);
    vec3 light = normalize(vec3(0.6, 0.8, 0.4));
    vec3 albedo = 0.55 + 0.35 * n * vec3(0.6, 0.4, 0.9);
    float diffuse = max(dot(n, light), 0.0);
    float sky = 0.5 + 0.5 * n.y;
    float specular = pow(max(dot(n, normalize(light - direction)), 0.0), 48.0);
    float fresnel = pow(1.0 - max(dot(n, -direction), 0.0), 4.0);
    float ao = occlusion(p, n);
    color = albedo * (0.9 * diffuse + 0.35 * sky * ao) + 0.4 * specular + 0.25 * fresnel * ao;
    color = mix(color, background(direction), smoothstep(8.0, MAX_DISTANCE, travelled));
  }
  fragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.8, 1.8, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1;
controls.maxDistance = 15;

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const uniforms = {
  uTime: { value: 0 },
  uA: { value: 0.5 },
  uB: { value: 0.5 },
  uCameraWorld: { value: camera.matrixWorld },
  uProjectionInverse: { value: camera.projectionMatrixInverse },
  uSkyTop: { value: new THREE.Color() },
  uSkyBottom: { value: new THREE.Color() },
};

function applyScheme() {
  const [top, bottom] = darkScheme.matches ? [0x1d2430, 0x07090c] : [0xf4f6f9, 0xbfc6cf];
  uniforms.uSkyTop.value.setHex(top, THREE.LinearSRGBColorSpace);
  uniforms.uSkyBottom.value.setHex(bottom, THREE.LinearSRGBColorSpace);
}
applyScheme();
darkScheme.addEventListener('change', applyScheme);

const material = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms,
  vertexShader,
  fragmentShader: fragmentShader({ sdf: 'float sdf(vec3 p, out vec3 gradient) { gradient = vec3(0.0); return 1.0; }', sdfValue: 'float sdfValue(vec3 p) { return 1.0; }' }),
  depthTest: false,
  depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
quad.frustumCulled = false;
const scene = new THREE.Scene();
scene.add(quad);

const editor = createEditor({
  source: elements.source,
  backdrop: elements.backdrop,
  error: elements.error,
  onEdit: () => { elements.preset.value = ''; },
}, (text) => {
  const shaders = buildShaders(text);
  material.fragmentShader = fragmentShader(shaders);
  material.needsUpdate = true;
  elements.code.textContent = `${shaders.sdf}\n\n// value only, for the finite-difference normals and ambient occlusion\n${shaders.sdfValue}`;
  elements['code-summary'].textContent = `Generated GLSL (${shaders.sdf.split('\n').length} lines with gradient)`;
});

renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  editor.show(`GLSL error:\n${gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(program)}`);
};

const custom = new Option('Custom', '');
custom.hidden = true;
elements.preset.append(custom, ...Object.keys(PRESETS).map((name) => new Option(name, name)));
elements.preset.addEventListener('change', () => {
  if (PRESETS[elements.preset.value]) editor.load(PRESETS[elements.preset.value]);
});

for (const name of ['a', 'b']) {
  const slider = elements[name];
  const uniform = uniforms[`u${name.toUpperCase()}`];
  const sync = () => {
    uniform.value = Number(slider.value);
    elements[`${name}-value`].textContent = uniform.value.toFixed(2);
  };
  slider.addEventListener('input', sync);
  sync();
}

elements.finite.addEventListener('change', () => {
  material.defines = elements.finite.checked ? { FINITE_DIFFERENCES: '' } : {};
  material.needsUpdate = true;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let previous = performance.now();
let frames = 0;
let fpsStart = previous;

renderer.setAnimationLoop((now) => {
  if (elements.animate.checked) uniforms.uTime.value += Math.min(now - previous, 100) / 1000;
  previous = now;
  controls.update();
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  frames += 1;
  if (now - fpsStart >= 500) {
    elements.fps.textContent = `${Math.round((frames * 1000) / (now - fpsStart))} fps`;
    frames = 0;
    fpsStart = now;
  }
});

if (window.matchMedia('(max-width: 600px)').matches) document.getElementById('panel').open = false;
elements.preset.value = Object.keys(PRESETS)[0];
editor.load(PRESETS[elements.preset.value]);
