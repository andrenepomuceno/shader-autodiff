# shader-autodiff (sketch)

Turn a math expression typed at runtime into GLSL/WGSL that computes its value **and exact
derivatives** in one pass, plus a matching JavaScript evaluator for the CPU. No CAS, no build step,
no dependencies.

```js
import { compile } from 'shader-autodiff';

const g = compile('(1 + a/(2*sqrt(r^2 + b^2)))^4', {
  variables: ['x', 'y', 'z'],          // differentiate with respect to these
  parameters: ['a', 'b', 't'],          // uniforms, not differentiated
  derived: { r: 'sqrt(x*x + y*y + z*z)' },
  order: 1,                             // 0 value, 1 gradient, 2 Hessian
});

g.glsl('conformal')   // float conformal(vec3 p, out vec3 grad) { ... }
g.wgsl('conformal')
g.evaluate({ x, y, z, a, b, t })        // { value, gradient, hessian? } in JS, same AST
```

Implemented so far: parser, JS evaluator, GLSL ES 3.00, WGSL and JS emitters, orders 0–2, Jacobian mode. See
[docs/api.md](docs/api.md) for the current API and the emitted code contract.

## Why

- **Exact, cheap derivatives on the GPU.** SDF normals, metric partials (Christoffel symbols),
  Jacobians of warps, curvature, Newton steps. Finite differences cost 4–7 extra evaluations
  and need an ε that is wrong somewhere.
- **Runtime, user-typed expressions.** Live editors (metric editors, shader playgrounds, graphing
  tools) need a safe parser and codegen in the browser, not an offline compiler.
- **One AST, two backends.** The CPU evaluator matches the shader, for tests, picking, sampling,
  camera logic.

## Design

1. **Parser.** A small Pratt parser with an allow-list grammar: numbers, named symbols,
   `+ - * / ^`, unary minus, calls to a fixed function table. Limits on depth, node count and
   exponent size (no power towers). Errors carry positions for editor squiggles.
2. **AST → SSA DAG.** Hash-consing merges equal subtrees (structural CSE) and folds constants.
3. **Forward mode at codegen time.** Each SSA node gets a value and a tangent per variable
   (a gradient), and for `order: 2` a Hessian (hyper-dual rules). The emitted code is **plain
   scalar/vector GLSL**: no dual structs at runtime, so the driver optimises it like hand-written
   code. Zero tangents are pruned: `∂/∂x` of a node that does not depend on `x` is never emitted.
   Gradients are packed into `vec3`/`vec4` when the variable count fits.
4. **Rules table.** One entry per function: value, first derivative, second derivative, domain
   notes. `sqrt` near 0, `abs`/`min`/`max` (subgradients, documented), `pow` with variable
   exponent via `exp(b·log(a))`, `atan2`, `smoothstep`, `mix`, `clamp`.
5. **Emitters.** GLSL ES 3.00 (WebGL2), GLSL 4.x, WGSL, JS. Float literals always with a dot
   (`1.0`), configurable precision, deterministic temporaries (`t0, t1, …`) for stable diffs and
   shader caching.
6. **Optional vector-valued functions.** `compile({ X: '…', Y: '…', Z: '…' })` returns the
   Jacobian, so a pullback metric g = JᵀJ comes straight out.

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

## Validation

- Property tests against a CAS (sympy via a dev-only script, or numeric central differences with
  tolerance) on random expressions from the grammar.
- GLSL vs JS agreement: compile, render values into a float texture, read back, compare.
- Golden files for emitted code.

## Benchmarks

Per-pixel cost of value + gradient for SDFs and metrics: generated code vs 4-tap / 6-tap finite
differences vs glsl-autodiff structs vs sympy-generated code (from metric-shaders), on desktop and
mobile GPUs.

## First client

metric-shaders: replace the sympy metric compiler (`metricTensor` + `metricPartials`) so the app can
run fully static. Acceptance test: every metric preset renders identically (within float tolerance)
to the sympy version.

## Milestones

1. Parser + JS evaluator + first-order GLSL emitter, rules for the metric-shaders function set.
2. CSE, tangent pruning, vector packing; golden tests; metric-shaders equivalence.
3. Second order (Hessian), WGSL emitter, Jacobian mode.
4. Playground page: type a formula, see the code, plot value and gradient.
