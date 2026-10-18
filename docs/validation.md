# Validation

## Automated (`node --test`)

- **Gradients and Hessians** against central differences on a catalogue of expressions and on 300
  random smooth expressions; Hessians are also checked for symmetry.
- **Emitted JS** is executed and must equal the interpreter bit for bit (value, gradient, Hessian,
  Jacobian, custom specs).
- **Golden files** (`test/golden/`) pin the GLSL, WGSL and JS text; regenerate with
  `UPDATE_GOLDEN=1 node --test` and review the diff.
- **metric-shaders equivalence (CPU).** `test/fixtures/metric-shaders.json` holds, for every
  metric-shaders preset, the sympy-generated GLSL and sympy reference values (30-digit `mpmath`) of
  the metric and its partials at 8 random points and uniforms. The adapter in
  `examples/metric-shaders/metric.js` must match them to 1e-12 (metric) and 1e-10 (partials),
  relative to the matrix size. Regenerate with
  `<metric-shaders>/.venv/Scripts/python tools/metric-shaders/reference.py --metric-shaders <metric-shaders> --out test/fixtures/metric-shaders.json`.

- **sympy on random expressions.** `test/fixtures/sympy-random.json` holds 200 random,
  domain-guarded expressions of the grammar (59 with `abs`/`min`/`max`/`atan2`) and the exact
  value, gradient and Hessian from sympy at ~600 points. Every entry must match to 1e-9 relative
  to `1 + |reference|`; the largest observed error is 1e-12. Regenerate with
  `<metric-shaders>/.venv/Scripts/python -B tools/sympy/random-expressions.py --out test/fixtures/sympy-random.json`.

## GPU agreement (manual)

```bash
node tools/gpu/serve.mjs      # then open http://127.0.0.1:8137/tools/gpu/
```

The page compiles everything in the browser and reads results back from the GPU in float32:

- WebGL2: our GLSL and the sympy GLSL of every metric preset, plus 58 expressions (18 fixed, 40
  random) with gradient and Hessian, rendered into RGBA32F targets.
- WebGPU: our WGSL for the same cases, run as compute shaders (also validates the WGSL with
  `getCompilationInfo`).

Errors are the largest entry-wise difference against the float64 reference, divided by
`1 + max |reference|` of the value, gradient, Hessian or matrix being compared. The page prints
`PASS` when everything is below 1e-3 and leaves the details in `window.gpuResults`.

### Results, 2026-10-18 (Chrome, Windows 11, NVIDIA)

| Case | WebGL2 ours | WebGL2 sympy | WebGPU ours |
| --- | --- | --- | --- |
| 15 of 17 metric presets | ≤ 6.7e-7 | ≤ 2.5e-7 | ≤ 6.7e-7 |
| wave-pullback | 1.9e-6 | 1.9e-6 | 1.9e-6 |
| weierstrass-haze | 9.9e-5 | 9.3e-5 | 4.6e-5 |
| 58 expressions, worst | 4.0e-5 | – | 1.2e-5 |

Our shaders are as accurate as the sympy ones in float32. The weierstrass-haze outliers come from
`sin` of large arguments in both versions.
