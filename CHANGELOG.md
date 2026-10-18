# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/); the emitted-code contract (signatures, output names,
temporaries) is part of the public API.

## Unreleased

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
