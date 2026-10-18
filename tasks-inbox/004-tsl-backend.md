# 004 TSL backend for three.js WebGPURenderer

three.js is moving custom shaders to TSL (node materials); `ShaderMaterial` is not supported by
`WebGPURenderer`. TSL itself has no automatic differentiation (only screen-space `dFdx`/`dFdy`).

- `toTSL(compiled, TSL)` (or `program.tsl(spec, TSL)`): build the TSL node graph directly from the
  SSA graph by calling the TSL namespace the caller passes in (`import * as TSL from 'three/tsl'`),
  so the library keeps zero dependencies. Returns nodes for value, gradient, Hessian, or a
  `TSL.Fn`.
- Map every operation (select → `TSL.select`/`cond`, atan2 → `TSL.atan`, …); float literals via
  `TSL.float`; share temporaries by reusing node objects (TSL dedupes by identity).
- Example with `WebGPURenderer` (WebGPU and WebGL2 fallback) and a `MeshStandardNodeMaterial` whose
  `positionNode`/`normalNode` come from a user-typed height field or warp.
- Tests: a fake TSL namespace that records calls (no three dependency in tests), plus a GPU check in
  the harness against three from a CDN.
