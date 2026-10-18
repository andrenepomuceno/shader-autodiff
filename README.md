# shader-autodiff

Turn a math expression typed at runtime into GLSL/WGSL that computes its value **and exact
derivatives** in one pass, plus a matching JavaScript evaluator for the CPU. No CAS, no build step,
no dependencies, about 15 kB.

## Install

```bash
npm install shader-autodiff
```

Or straight from a CDN, no build step (plain ES modules):

```js
import { compile } from 'https://cdn.jsdelivr.net/npm/shader-autodiff@0.1.0/src/index.js';
```

TypeScript declarations ship in `types/index.d.ts`.

## Usage

```js
import { compile } from 'shader-autodiff';

const g = compile('(1 + a/(2*sqrt(r^2 + b^2)))^4', {
  variables: ['x', 'y', 'z'],          // differentiate with respect to these
  parameters: ['a', 'b', 't'],          // uniforms, not differentiated
  derived: { r: 'sqrt(x*x + y*y + z*z)' },
  order: 1,                             // 0 value, 1 gradient, 2 Hessian
});

g.glsl('conformal', { parameters: { a: 'u_params.x', b: 'u_params.y' } })
// float conformal(vec3 p, out vec3 gradient) { ... }
g.wgsl('conformal')                     // fn conformal(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32
g.js('conformal')                       // source of the same function in JS
g.evaluate({ x, y, z, a, b, t })        // { value, gradient } computed from the same graph
```

`compile({ X: '…', Y: '…', Z: '…' }, …)` returns values and the Jacobian, and `createProgram` is the
low-level API for structured outputs (several functions sharing one graph, nested derivatives,
`mat3` returns). See [docs/api.md](docs/api.md) for the API and the emitted-code contract, and
[docs/validation.md](docs/validation.md) for how it is tested.

## Examples

- [examples/three](examples/three/): a three.js raymarcher for SDFs you type, with normals from the
  exact gradient and steps scaled by it (so even non-distance fields march safely). Serve the repo
  root (`node tools/gpu/serve.mjs`) and open `/examples/three/`.
- [examples/metric-shaders](examples/metric-shaders/metric.js): metric tensors and their partials
  for geodesic ray tracing, including pullback metrics from nested derivatives.

## Why

- **Exact, cheap derivatives on the GPU.** SDF normals, metric partials (Christoffel symbols),
  Jacobians of warps, curvature, Newton steps. Finite differences cost 4–7 extra evaluations
  and need an ε that is wrong somewhere.
- **Runtime, user-typed expressions.** Live editors (metric editors, shader playgrounds, graphing
  tools) need a safe parser and codegen in the browser, not an offline compiler.
- **One graph, every backend.** The CPU evaluator matches the shader, for tests, picking, sampling,
  camera logic.

## Design

1. **Parser.** A small Pratt parser with an allow-list grammar: numbers, named symbols,
   `+ - * / ^`, unary minus, calls to a fixed function table. Limits on length, depth, node count
   and exponent size (no power towers). Errors carry positions for editor squiggles.
2. **AST → SSA DAG.** Hash-consing merges equal subtrees (structural CSE), constants fold, local
   identities simplify, commutative operands are put in a canonical order.
3. **Forward mode at codegen time.** Tangents are built as graph nodes, so they share
   subexpressions with the value and can be differentiated again (Hessians, pullback metrics).
   The emitted code is **plain scalar/vector code**: no dual structs at runtime, so the driver
   optimises it like hand-written code. Zero tangents are pruned: `∂/∂x` of a node that does not
   depend on `x` is never emitted. Gradients are packed into `vecN`/`matN` when the sizes fit.
4. **Rules table.** One entry per operation: value and tangent rule. Subgradients for
   `abs`/`min`/`max`, zero derivative for `sign`/`floor`, integer powers as products, `pow` with a
   variable exponent through `log`.
5. **Emitters.** GLSL ES 3.00 (WebGL2; also valid desktop GLSL 3.30+), WGSL, JS. Float literals
   always with a dot, deterministic temporaries (`t0, t1, …`) for stable diffs and shader caching.

## Prior art and positioning

| Project | What it is | Gap this fills |
| --- | --- | --- |
| [Slang](https://github.com/shader-slang/slang) | Full shading language with forward/backward autodiff; targets GLSL, HLSL, SPIR-V, Metal, WGSL (experimental) | Heavy native/WASM compiler, shader source as input; not a small library for user-typed formulas in a browser |
| [glsl-autodiff](https://github.com/sibaku/glsl-autodiff) | GLSL header with dual/hyper-dual types and overloaded functions | You write the GLSL by hand; dual structs at runtime; no parser, no CPU twin |
| [Symbolic Differentiation in GPU Shaders](https://www.microsoft.com/en-us/research/publication/symbolic-differentiation-in-gpu-shaders/) (MSR 2011) | Derivatives as an HLSL compiler feature | Research, not an available tool |
| [Vertex shader domain warping with AD](https://arxiv.org/pdf/2405.07124) (2024) | Host language generates GLSL with derivatives | Same idea, but a paper, not a reusable library |
| [GradientScript](https://github.com/mfagerlund/gradient-script) | Source-to-source gradient formulas | GLSL output unclear |
| [shader-ast](https://github.com/thi-ng/umbrella/tree/develop/packages/shader-ast), swizzler | TypeScript DSLs compiled to GLSL/JS | No differentiation |

The niche: **string in, optimised derivative-carrying GLSL/WGSL + JS out, safe for user input, in a
few KB.**

## First client

[metric-shaders](examples/metric-shaders/metric.js): the adapter replaces the sympy metric compiler
(`metricTensor` + `metricPartials`) so the app can run fully static. Every metric preset matches the
sympy values on the CPU (to 1e-10) and on the GPU (WebGL2 and WebGPU, within float32 accuracy).

## Roadmap

- Benchmarks: per-pixel cost of value + gradient for SDFs and metrics, generated code vs finite
  differences vs glsl-autodiff structs vs sympy-generated code, on desktop and mobile GPUs.
- Playground page: type a formula, see the code, plot value and gradient.
- More optimisation: common-factor extraction across sums.

## License

[MIT](LICENSE)
