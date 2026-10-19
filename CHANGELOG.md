# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/); the emitted-code contract (signatures, output names,
temporaries) is part of the public API.

## Unreleased

- Algebraic normal form for arithmetic: like terms combine and cancel, `sin² + cos² = 1`,
  `sqrt(q)² = q`, monic sums shared across scalar multiples. Metric partials went from a median
  1.45× (at most 2.10×) the cost of the sympy-generated GLSL to 1.07× (at most 1.14×); twist,
  rotating-hallway and city-fold are now faster, and twist's dg/dy is identically zero. Emitted code
  is smaller and the first derivatives of SDFs are cheaper.
- `scripts/release.mjs --dry-run` works after the first release (it checked the published version).
- Headless GPU checks and benchmarks on a chosen GPU: `npm run test:gpu`, `npm run bench:gpu`
  (`--adapter=GPU2` or a name part).
- Benchmarks: GPU cost and float32 precision page (`tools/gpu/bench.html`), CPU benchmark
  (`tools/bench-cpu.mjs`), results in `docs/benchmarks.md`.
- `examples/tsl`: `WebGPURenderer` node material with a typed height field or warp, exact per-pixel
  normals from `tsl()`, self-checked headless on WebGPU and the WebGL2 fallback by `npm run test:gpu`.
- Examples share one editor module (`examples/shared/`); repeating a `name = …` line is now an error.
- README: CommonJS consumers use `import()`, or `require()` on Node 20.19+ / 22.12+.

## 0.1.0 - 2026-10-18

First public release.

- `compile(text, options)`: value, gradient (`order: 1`) and exactly symmetric Hessian
  (`order: 2`) of a user-typed expression; named expressions give values and the Jacobian.
- Emitters for GLSL ES 3.00, WGSL and JavaScript, plus a float64 JS evaluator, all evaluating the
  same SSA graph.
- `createProgram(options)`: low-level API with shared graphs, nested derivatives and structured
  outputs (`vecN`, `matCxR`, `float[N]`).
- Safe allow-list grammar with limits and positioned `ExpressionError`s; functions `sin cos tan asin
  acos atan atan2 sinh cosh tanh exp log sqrt exp2 log2 abs sign floor fract min max pow mod clamp
  mix step smoothstep`, constants `pi`, `E`.
- Hash-consing CSE, constant folding, constant hoisting, zero-tangent pruning.
- three.js TSL backend: `compiled.tsl(TSL, { inputs, parameters })` builds node-material nodes
  for `WebGPURenderer` without depending on three.
- three.js example: raymarching user-typed SDFs with exact-gradient normals.
- TypeScript declarations (`types/index.d.ts`).
- Validated against sympy (metric-shaders presets and random expressions) and on the GPU (WebGL2,
  WebGPU and three.js TSL readback).

