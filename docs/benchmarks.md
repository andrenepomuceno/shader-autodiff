# Benchmarks

Measured 2026-10-18 on Windows 11 Pro, Intel Core i7-14700K, NVIDIA GeForce RTX 5060 Ti, Chrome 155
(WebGL2 through ANGLE Direct3D11, WebGPU through Dawn D3D12; the adapter reports `nvidia blackwell`),
Node v24.14.0. Everything here can be rerun:

```bash
node tools/gpu/serve.mjs 8139     # open http://127.0.0.1:8139/tools/gpu/bench.html (~3 minutes)
node tools/bench-cpu.mjs          # CPU numbers, prints Markdown
```

The page prints the tables below and leaves them in `window.benchResults` (`done` flag, `markdown`
string, raw numbers including 95th percentiles).

## Method

**Cases.** Eight fields f(x, y, z; a, b, t) from `tools/gpu/cases.js` (`benchmarkFields()`): a
sphere, the torus ∪ ball smooth-min, gyroid-in-ball and log-sum-exp blobs SDFs of the three.js
example, the Schwarzschild lens metric component `(1 + a/(2·sqrt(r² + b²)))⁴`, and the three
longest of 30 random depth-6 expressions of `randomExpression` (seed 2028). Uniforms a = b = 0.5,
t = 1.25. Plus the 17 metric-shaders presets of `test/fixtures/metric-shaders.json` with their
default uniforms and morph s = 1.

**Variants.** Fields: `value` (`order: 0`, one function); `exact` (`order: 1`, value and gradient in
one function); `fd4`, the tetrahedron stencil (4 evaluations of the value-only function); `fd6`,
central differences (6 evaluations). Both FD variants also return a value (the mean of their taps),
so every variant produces value + gradient. Metrics: `tensor` (`metricTensor` alone); `exact` (our
`metricTensor` + `metricPartials` from `examples/metric-shaders/metric.js`); `sympy` (the GLSL of the
metric-shaders sympy compiler, same signatures); `fd` (`metricTensor` plus 6 more `metricTensor`
evaluations, central differences). FD uses ε = 10⁻³ in the cost runs.

**Cost.** A 2048×2048 pass; each pixel evaluates its variant at 16 points p + i·δ (i = 0…15) and the
sum of the 16 results (every component of value, gradient or matrices, weighted by uniforms) is
written out, so nothing can be dead-code-eliminated. WebGL2 draws a full-screen triangle into an
RGBA8 renderbuffer; WebGPU runs the same code as a compute shader (8×8 workgroups) writing a storage
buffer. The variants of a case are compiled once and timed interleaved: 2 warm-up frames each, then
3 rounds × 5 frames (on WebGPU each timed sample is a pass of 32 dispatches, divided by 32); the
table shows the **median of the 15 samples in ns per pixel** (16 evaluations; ms per 2048² frame =
ns × 4.19) and the ratio to the cheapest variant. A baseline pass with no evaluation costs 0.008 ns
(WebGL2) and 0.015 ns (WebGPU).

**Timing.** WebGL2: `EXT_disjoint_timer_query_webgl2`, GPU elapsed time per draw, results polled
through `MessageChannel` tasks and discarded if `GPU_DISJOINT_EXT` is set. WebGPU:
`timestamp-query` writes at the beginning and end of each compute pass; Chrome quantizes the
timestamps (multiples of ~65 µs were observed), so each timed pass holds 32 dispatches and the time
is divided by 32. Neither method depends on `requestAnimationFrame`, so the tab may be in the
background. Wall-clock fallbacks (around `gl.finish()` + `readPixels`, around
`queue.onSubmittedWorkDone()`) exist in `bench.js` but were not needed on this machine.

**Precision.** 4096 random float32 points per case: [−2, 2]³ for the SDFs and the Schwarzschild
field, [0.3, 2.3]³ for the random expressions (their `1.5 + a·b` denominators only guard positive
inputs; in [−2, 2]³ all three have poles), [−3, 3]³ with |p| ≥ 0.2 for the metrics, as in the
fixture. The reference is the float64 JS evaluator (`compiled.evaluate`; for the presets
`compileMetric(...).evaluate`, which matches the sympy values to 10⁻¹⁰) at the same float32 inputs.
The GPU (WebGL2, RGBA32F read-back) evaluates `exact`, and `fd4`/`fd6`/`fd` at ε = 10⁻¹, 10⁻²,
10⁻³, 10⁻⁴. Error is max |actual − reference| over the 3 gradient entries (27 partial entries)
divided by 1 + max |reference|; the angle is between the GPU gradient and the reference gradient.
Tables give median / max over the points.

## GPU cost, WebGL2

| Field | value (ns) | exact (ns, ×value) | fd4 (ns, ×value) | fd6 (ns, ×value) |
| --- | --- | --- | --- | --- |
| sphere | 0.0125 | 0.0288 (×2.30) | 0.0616 (×4.93) | 0.0729 (×5.83) |
| torus-ball-smin | 0.0508 | 0.165 (×3.24) | 0.180 (×3.54) | 0.279 (×5.48) |
| gyroid-ball | 0.0715 | 0.103 (×1.44) | 0.173 (×2.43) | 0.255 (×3.57) |
| blobs-lse | 0.0787 | 0.134 (×1.70) | 0.308 (×3.92) | 0.488 (×6.21) |
| schwarzschild | 0.0231 | 0.0415 (×1.80) | 0.0994 (×4.30) | 0.129 (×5.60) |
| random-1 | 0.153 | 0.271 (×1.77) | 0.496 (×3.24) | 0.682 (×4.46) |
| random-2 | 0.0988 | 0.163 (×1.65) | 0.246 (×2.49) | 0.348 (×3.53) |
| random-3 | 0.188 | 0.256 (×1.36) | 0.535 (×2.84) | 0.745 (×3.95) |

| Metric preset | tensor (ns) | exact (ns, ×tensor) | sympy (ns, ×tensor) | fd (ns, ×tensor) |
| --- | --- | --- | --- | --- |
| anisotropic-stretch | 0.00729 | 0.00729 (×1.00) | 0.00729 (×1.00) | 0.00939 (×1.29) |
| city-fold | 0.162 | 0.370 (×2.29) | 0.499 (×3.09) | 0.630 (×3.90) |
| euclidean | 0.00729 | 0.00729 (×1.00) | 0.00729 (×1.00) | 0.00729 (×1.00) |
| expanding-shell | 0.0272 | 0.0833 (×3.06) | 0.0575 (×2.12) | 0.171 (×6.27) |
| gaussian-lens | 0.0205 | 0.0758 (×3.70) | 0.0457 (×2.23) | 0.111 (×5.43) |
| log-periodic | 0.0251 | 0.0662 (×2.63) | 0.0580 (×2.31) | 0.168 (×6.68) |
| mirage | 0.0374 | 0.0808 (×2.16) | 0.0801 (×2.14) | 0.125 (×3.33) |
| poincare-ball | 0.0269 | 0.0893 (×3.31) | 0.0557 (×2.07) | 0.166 (×6.18) |
| ripple | 0.0255 | 0.0565 (×2.22) | 0.0499 (×1.96) | 0.0829 (×3.26) |
| rotating-hallway | 0.0638 | 0.161 (×2.52) | 0.134 (×2.10) | 0.300 (×4.71) |
| scale-invariant | 0.0234 | 0.0728 (×3.11) | 0.0492 (×2.10) | 0.164 (×7.00) |
| schwarzschild-lens | 0.0283 | 0.0928 (×3.28) | 0.0537 (×1.90) | 0.170 (×6.02) |
| spherical-stereographic | 0.0196 | 0.0771 (×3.93) | 0.0433 (×2.21) | 0.113 (×5.78) |
| twist | 0.0482 | 0.136 (×2.81) | 0.0635 (×1.32) | 0.248 (×5.15) |
| wave-pullback | 0.0194 | 0.0357 (×1.84) | 0.0401 (×2.07) | 0.0540 (×2.79) |
| weierstrass-haze | 0.107 | 0.255 (×2.38) | 0.237 (×2.22) | 0.550 (×5.15) |
| wormhole-like | 0.0204 | 0.0713 (×3.49) | 0.0456 (×2.23) | 0.115 (×5.63) |

## GPU cost, WebGPU

| Field | value (ns) | exact (ns, ×value) | fd4 (ns, ×value) | fd6 (ns, ×value) |
| --- | --- | --- | --- | --- |
| sphere | 0.0195 | 0.0371 (×1.90) | 0.0830 (×4.25) | 0.105 (×5.40) |
| torus-ball-smin | 0.0674 | 0.201 (×2.99) | 0.241 (×3.57) | 0.345 (×5.12) |
| gyroid-ball | 0.0732 | 0.118 (×1.61) | 0.202 (×2.75) | 0.334 (×4.56) |
| blobs-lse | 0.0859 | 0.188 (×2.19) | 0.337 (×3.92) | 0.513 (×5.97) |
| schwarzschild | 0.0283 | 0.0615 (×2.17) | 0.123 (×4.33) | 0.170 (×6.00) |
| random-1 | 0.163 | 0.277 (×1.70) | 0.511 (×3.13) | 0.833 (×5.11) |
| random-2 | 0.0928 | 0.148 (×1.60) | 0.238 (×2.56) | 0.418 (×4.51) |
| random-3 | 0.129 | 0.194 (×1.50) | 0.375 (×2.90) | 0.634 (×4.90) |

| Metric preset | tensor (ns) | exact (ns, ×tensor) | fd (ns, ×tensor) |
| --- | --- | --- | --- |
| anisotropic-stretch | 0.00488 | 0.00488 (×1.00) | 0.00488 (×1.00) |
| city-fold | 0.192 | 0.463 (×2.41) | 0.998 (×5.19) |
| euclidean | 0.00488 | 0.00488 (×1.00) | 0.00488 (×1.00) |
| expanding-shell | 0.0454 | 0.135 (×2.97) | 0.267 (×5.87) |
| gaussian-lens | 0.0439 | 0.133 (×3.03) | 0.244 (×5.56) |
| log-periodic | 0.0444 | 0.122 (×2.74) | 0.265 (×5.97) |
| mirage | 0.0508 | 0.129 (×2.55) | 0.270 (×5.32) |
| poincare-ball | 0.0439 | 0.148 (×3.38) | 0.295 (×6.71) |
| ripple | 0.0371 | 0.0923 (×2.49) | 0.205 (×5.51) |
| rotating-hallway | 0.0977 | 0.238 (×2.44) | 0.503 (×5.15) |
| scale-invariant | 0.0410 | 0.125 (×3.05) | 0.278 (×6.77) |
| schwarzschild-lens | 0.0449 | 0.142 (×3.16) | 0.306 (×6.80) |
| spherical-stereographic | 0.0415 | 0.133 (×3.21) | 0.246 (×5.92) |
| twist | 0.0811 | 0.213 (×2.63) | 0.465 (×5.73) |
| wave-pullback | 0.0293 | 0.0625 (×2.13) | 0.146 (×4.98) |
| weierstrass-haze | 0.132 | 0.304 (×2.31) | 0.859 (×6.51) |
| wormhole-like | 0.0410 | 0.134 (×3.27) | 0.243 (×5.92) |

The sympy GLSL has no WGSL counterpart, so that column only exists on WebGL2.

## Precision in float32 (WebGL2)

Normal angle error in degrees, median / max over 4096 points:

| Field | exact | fd4 ε=0.1 | fd4 ε=0.01 | fd4 ε=0.001 | fd4 ε=0.0001 | fd6 ε=0.1 | fd6 ε=0.01 | fd6 ε=0.001 | fd6 ε=0.0001 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sphere | 8.5e-7 / 2.7e-6 | 1 / 7.9 | 0.1 / 1.4 | 0.01 / 0.15 | 0.019 / 0.081 | 0.013 / 3 | 0.00035 / 0.053 | 0.0027 / 0.011 | 0.026 / 0.11 |
| torus-ball-smin | 6.6e-6 / 0.00011 | 4.1 / 120 | 0.35 / 110 | 0.035 / 62 | 0.019 / 0.14 | 0.073 / 86 | 0.0006 / 71 | 0.0024 / 35 | 0.022 / 0.18 |
| gyroid-ball | 8.5e-7 / 0.00037 | 1 / 170 | 0.1 / 150 | 0.01 / 50 | 0.02 / 0.49 | 0.011 / 130 | 0.0003 / 67 | 0.0027 / 23 | 0.025 / 0.11 |
| blobs-lse | 5.3e-6 / 5.1e-5 | 1.3 / 43 | 0.13 / 5.6 | 0.013 / 0.64 | 0.024 / 0.13 | 0.052 / 4.6 | 0.00075 / 0.05 | 0.0034 / 0.023 | 0.033 / 0.18 |
| schwarzschild | 1.7e-6 / 7.9e-6 | 3.1 / 9.7 | 0.31 / 1.1 | 0.041 / 0.13 | 0.21 / 1.2 | 0.068 / 0.57 | 0.0033 / 0.019 | 0.029 / 0.18 | 0.29 / 1.9 |
| random-1 | 4.8e-5 / 0.0098 | 7.5 / 180 | 0.71 / 170 | 0.071 / 160 | 0.023 / 140 | 0.28 / 170 | 0.003 / 170 | 0.0023 / 170 | 0.017 / 17 |
| random-2 | 3.4e-6 / 2.9e-5 | 1.9 / 4.6 | 0.19 / 0.46 | 0.02 / 0.05 | 0.024 / 0.29 | 0.09 / 0.67 | 0.00095 / 0.0069 | 0.0026 / 0.036 | 0.025 / 0.49 |
| random-3 | 1.0e-5 / 8.5e-5 | 2.3 / 6.7 | 0.21 / 0.7 | 0.027 / 0.16 | 0.12 / 0.77 | 0.17 / 1.2 | 0.0025 / 0.014 | 0.015 / 0.11 | 0.15 / 0.97 |

Gradient error relative to 1 + max |reference|, median / max:

| Field | exact | fd4 ε=0.1 | fd4 ε=0.01 | fd4 ε=0.001 | fd4 ε=0.0001 | fd6 ε=0.1 | fd6 ε=0.01 | fd6 ε=0.001 | fd6 ε=0.0001 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sphere | 1.8e-8 / 7.9e-8 | 0.011 / 0.2 | 0.0011 / 0.014 | 0.00012 / 0.0014 | 0.00021 / 0.00091 | 0.00024 / 0.047 | 4.8e-6 / 0.00055 | 3.3e-5 / 0.00012 | 0.00027 / 0.00097 |
| torus-ball-smin | 7.6e-8 / 1.1e-6 | 0.046 / 0.71 | 0.0043 / 0.56 | 0.00042 / 0.37 | 0.00022 / 0.0012 | 0.00099 / 0.73 | 8.9e-6 / 0.56 | 3.1e-5 / 0.36 | 0.00025 / 0.0015 |
| gyroid-ball | 2.0e-8 / 1.1e-6 | 0.011 / 0.84 | 0.0011 / 0.59 | 0.00012 / 0.3 | 0.00023 / 0.00086 | 0.00024 / 0.57 | 4.9e-6 / 0.48 | 3.2e-5 / 0.24 | 0.00027 / 0.00097 |
| blobs-lse | 5.6e-8 / 4.1e-7 | 0.013 / 0.26 | 0.0013 / 0.033 | 0.00014 / 0.0034 | 0.00026 / 0.0014 | 0.00064 / 0.096 | 8.8e-6 / 0.0011 | 3.8e-5 / 0.00019 | 0.00035 / 0.002 |
| schwarzschild | 2.9e-8 / 3.8e-7 | 0.015 / 0.17 | 0.0015 / 0.018 | 0.0002 / 0.0017 | 0.0011 / 0.0031 | 0.00031 / 0.047 | 1.8e-5 / 0.0005 | 0.00015 / 0.00038 | 0.0015 / 0.004 |
| random-1 | 1.3e-6 / 0.049 | 0.047 / 1000 | 0.0046 / 50 | 0.00046 / 3.6 | 0.00025 / 1.7 | 0.0068 / 470 | 6.7e-5 / 72 | 3.1e-5 / 21 | 0.00025 / 2 |
| random-2 | 3.1e-8 / 2.1e-7 | 0.011 / 0.05 | 0.0011 / 0.005 | 0.00011 / 0.00054 | 0.00018 / 0.0011 | 0.0013 / 0.013 | 1.3e-5 / 0.00013 | 2.0e-5 / 0.00011 | 0.00019 / 0.0011 |
| random-3 | 7.2e-8 / 4.4e-7 | 0.0093 / 0.066 | 0.0009 / 0.0068 | 0.00012 / 0.00068 | 0.00059 / 0.0017 | 0.0011 / 0.011 | 1.4e-5 / 0.00011 | 7.4e-5 / 0.00021 | 0.00072 / 0.0022 |

Metric partials error relative to 1 + max |reference|, median / max:

| Metric preset | exact | sympy | fd ε=0.1 | fd ε=0.01 | fd ε=0.001 | fd ε=0.0001 |
| --- | --- | --- | --- | --- | --- | --- |
| anisotropic-stretch | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| city-fold | 7.7e-9 / 9.2e-8 | 1.2e-8 / 8.4e-8 | 1.2e-5 / 0.00014 | 7.6e-6 / 2.8e-5 | 7.3e-5 / 0.0003 | 0.00068 / 0.0027 |
| euclidean | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| expanding-shell | 2.6e-9 / 5.9e-7 | 7.7e-10 / 5.1e-7 | 8.7e-5 / 0.0026 | 7.1e-6 / 4.6e-5 | 5.7e-5 / 0.00031 | 0.00046 / 0.0039 |
| gaussian-lens | 5.1e-8 / 2.4e-7 | 4.3e-8 / 2.2e-7 | 0.00039 / 0.0011 | 1.0e-5 / 6.5e-5 | 9.6e-5 / 0.00073 | 0.001 / 0.0049 |
| log-periodic | 8.6e-8 / 1.2e-6 | 8.8e-8 / 1.7e-6 | 0.00062 / 0.47 | 9.3e-6 / 0.0057 | 4.1e-5 / 0.00025 | 0.00041 / 0.0028 |
| mirage | 9.1e-11 / 1.4e-8 | 9.5e-11 / 1.4e-8 | 3.6e-5 / 0.00094 | 1.5e-6 / 1.2e-5 | 1.0e-5 / 3.0e-5 | 7.2e-5 / 0.0003 |
| poincare-ball | 2.5e-8 / 1.3e-7 | 1.6e-8 / 1.2e-7 | 2.7e-5 / 3.3e-5 | 8.4e-6 / 2.9e-5 | 8.3e-5 / 0.00031 | 0.00084 / 0.0029 |
| ripple | 5.9e-8 / 3.5e-7 | 5.9e-8 / 3.4e-7 | 0.00031 / 0.00066 | 4.4e-6 / 2.3e-5 | 3.5e-5 / 0.00022 | 0.00035 / 0.0017 |
| rotating-hallway | 1.6e-8 / 4.7e-8 | 1.5e-8 / 4.7e-8 | 5.4e-7 / 1.9e-6 | 3.3e-6 / 1.4e-5 | 3.2e-5 / 0.00011 | 0.00031 / 0.0011 |
| scale-invariant | 6.4e-9 / 4.3e-7 | 4.4e-9 / 2.2e-7 | 5.4e-5 / 0.2 | 9.1e-7 / 0.0018 | 7.2e-6 / 5.2e-5 | 7.3e-5 / 0.00043 |
| schwarzschild-lens | 5.2e-8 / 4.9e-7 | 4.2e-8 / 3.6e-7 | 0.00025 / 0.062 | 2.0e-5 / 0.00065 | 0.00017 / 0.0005 | 0.0017 / 0.0049 |
| spherical-stereographic | 3.7e-8 / 1.7e-7 | 2.7e-8 / 1.1e-7 | 0.00015 / 0.00024 | 1.2e-5 / 4.5e-5 | 0.00012 / 0.00044 | 0.0012 / 0.005 |
| twist | 3.7e-8 / 1.5e-7 | 3.7e-8 / 1.4e-7 | 4.6e-7 / 2.4e-6 | 4.2e-6 / 2.3e-5 | 4.1e-5 / 0.0002 | 0.00041 / 0.0019 |
| wave-pullback | 9.6e-8 / 7.5e-7 | 8.9e-8 / 7.4e-7 | 0.0019 / 0.0026 | 1.9e-5 / 4.3e-5 | 2.7e-5 / 0.00013 | 0.00028 / 0.0017 |
| weierstrass-haze | 9.6e-8 / 5.9e-7 | 9.6e-8 / 6.1e-7 | 0.006 / 0.011 | 6.2e-5 / 0.00012 | 2.3e-5 / 8.5e-5 | 0.00023 / 0.00085 |
| wormhole-like | 2.0e-8 / 2.9e-7 | 1.5e-8 / 2.6e-7 | 0.00019 / 0.019 | 8.2e-6 / 0.0002 | 6.7e-5 / 0.00019 | 0.00067 / 0.0018 |

## CPU (`node tools/bench-cpu.mjs`)

Compile times are medians of 50 runs (after 5 warm-ups); throughput is measured over at least
300 ms of calls at 64 random points, each function with its own call site.

| Field | compile, gradient (ms) | emit GLSL (ms) | compile, Hessian (ms) | GLSL lines (gradient) |
| --- | --- | --- | --- | --- |
| sphere | 0.055 | 0.018 | 0.064 | 7 |
| torus-ball-smin | 0.187 | 0.080 | 0.464 | 41 |
| gyroid-ball | 0.132 | 0.067 | 0.301 | 21 |
| blobs-lse | 0.316 | 0.081 | 0.694 | 25 |
| schwarzschild | 0.105 | 0.031 | 0.266 | 9 |
| random-1 | 0.295 | 0.090 | 0.693 | 33 |
| random-2 | 0.173 | 0.047 | 0.342 | 19 |
| random-3 | 0.253 | 0.066 | 0.651 | 23 |

| Field | `evaluate` (k/s) | emitted JS (M/s) | `evaluate` + Hessian (k/s) | emitted JS + Hessian (M/s) |
| --- | --- | --- | --- | --- |
| sphere | 302 | 274.7 | 105 | 36.9 |
| torus-ball-smin | 37 | 23.2 | 8 | 7.0 |
| gyroid-ball | 40 | 7.9 | 18 | 6.0 |
| blobs-lse | 25 | 6.5 | 8 | 4.5 |
| schwarzschild | 80 | 30.2 | 16 | 11.2 |
| random-1 | 24 | 5.3 | 7 | 3.8 |
| random-2 | 42 | 7.3 | 15 | 6.2 |
| random-3 | 31 | 5.5 | 9 | 4.1 |

| Metric preset | `compileMetric` (ms) | GLSL ours | GLSL sympy | ours / sympy |
| --- | --- | --- | --- | --- |
| anisotropic-stretch | 0.128 | 452 B, 11 lines | 480 B, 11 lines | 0.94 |
| city-fold | 1.933 | 5210 B, 114 lines | 11359 B, 161 lines | 0.46 |
| euclidean | 0.081 | 395 B, 11 lines | 356 B, 10 lines | 1.11 |
| expanding-shell | 0.377 | 1087 B, 22 lines | 1213 B, 21 lines | 0.90 |
| gaussian-lens | 0.326 | 988 B, 21 lines | 967 B, 18 lines | 1.02 |
| log-periodic | 0.305 | 912 B, 16 lines | 955 B, 16 lines | 0.95 |
| mirage | 0.342 | 1061 B, 23 lines | 1328 B, 23 lines | 0.80 |
| poincare-ball | 0.341 | 1211 B, 27 lines | 1137 B, 21 lines | 1.07 |
| ripple | 0.196 | 812 B, 19 lines | 977 B, 19 lines | 0.83 |
| rotating-hallway | 0.705 | 2103 B, 52 lines | 3203 B, 43 lines | 0.66 |
| scale-invariant | 0.295 | 840 B, 18 lines | 865 B, 16 lines | 0.97 |
| schwarzschild-lens | 0.345 | 1038 B, 23 lines | 1058 B, 18 lines | 0.98 |
| spherical-stereographic | 0.290 | 930 B, 21 lines | 965 B, 18 lines | 0.96 |
| twist | 0.500 | 1741 B, 46 lines | 1684 B, 26 lines | 1.03 |
| wave-pullback | 0.190 | 739 B, 17 lines | 898 B, 13 lines | 0.82 |
| weierstrass-haze | 1.138 | 2770 B, 54 lines | 3658 B, 50 lines | 0.76 |
| wormhole-like | 0.290 | 953 B, 21 lines | 1005 B, 18 lines | 0.95 |

`compileMetric` includes emitting both GLSL and WGSL.

## Reading the numbers

**Exact gradients are cheaper than finite differences, by less than the tap count suggests.** On
WebGL2 the exact gradient costs 1.4–3.2× the value alone, the 4-tap stencil 2.4–4.9× and central
differences 3.5–6.2× (WebGPU: 1.5–3.0×, 2.6–4.3×, 4.5–6.0×). Because the gradient shares every
subexpression with the value (each `sin`, `exp`, `sqrt` is computed once), its extra cost is a few
multiply-adds per node and variable, while FD re-evaluates everything. The margin is widest for
smooth, transcendental-heavy fields (blobs-lse: 0.134 ns exact against 0.308 fd4 and 0.488 fd6;
gyroid-ball: ×1.44) and narrowest for branchy ones: torus-ball-smin (`abs`, `max`, `clamp`, `mix`)
costs 0.165 ns exact against 0.180 for fd4, because every branch adds a `select` to each gradient
component. The exact gradient was never slower than fd4 here, but on that kind of field it is close.

**Metric partials: faster than FD, slower than sympy.** Our `metricTensor` + `metricPartials` costs
1.8–3.9× the tensor and is 1.5–2.5× cheaper than the 6-evaluation FD on every non-constant preset.
The sympy compiler's partials, however, cost only 1.3–2.3× the tensor (3.1× on city-fold): ours are
slower on 12 of the 15 non-constant presets, by up to 2.1× (twist 0.136 vs 0.064 ns,
spherical-stereographic 0.077 vs 0.043, schwarzschild-lens 0.093 vs 0.054; within 15 % on
log-periodic, ripple and weierstrass-haze), equal on mirage, and faster on city-fold (0.370 vs 0.499)
and wave-pullback. The emitted code says why: we do no algebra
beyond local identities. sympy cancels `sin² + cos²`, notices that `twist`'s `dgdy` is identically
zero (ours computes it: `sin·(a·cos) − cos·(a·sin)` is not structurally equal, so hash-consing cannot
cancel it), and hoists the factor common to the three partials once (`metric_t2 = 4·a·s·t1·(t1+1)/b²`,
then `−metric_t2 · p.x`). Ours nests the products with the coordinate factor innermost,
`u_morph · (t3 · (a · (t2 · (t0 · (p.x / t4) / t1))))`, so the shared factor and two divisions are
repeated per coordinate, and the chain through the derived `r = sqrt(x² + y² + z²)` leaves
`t0 · (p.x / (2·t0))`, which a shader compiler will not cancel without fast-math. Emitted size does
not predict this (twist: same bytes, 2.1× slower). Flattening products and sums and extracting common
factors, the roadmap item, now has a measured target: the sympy column.

**Precision: exact derivatives are at float32 rounding; FD needs an ε that is wrong somewhere.** The
exact gradient's normal is off by 1e-6–1e-5° (median; 5e-5° for random-1) and its relative error is
2e-8–8e-8 (1.3e-6 for random-1), i.e. the rounding of the float32 evaluation itself. FD error is
U-shaped in ε. The tetrahedron stencil is first
order (its error has an ε·∂²f term): 1°, 0.1°, 0.01° at ε = 0.1, 0.01, 0.001 on the sphere, then
0.02° at 1e-4 where the rounding of f(p ± ε) takes over. Central differences are second order
(0.013°, 0.00035°) but already rounding-limited at ε = 1e-3 (0.0027°) and worse at 1e-4 (0.026°). The
best ε differs per field (1e-2 for the SDFs, 1e-3 for random-1 with fd6, and schwarzschild is worse at
1e-3 than the sphere at 1e-4 because its values are larger), and the best FD result in the table
(fd6, ε = 1e-2, 3.5e-4° on the sphere) is still 400× the exact error. At the creases of `abs`/`max`
(torus-ball-smin, gyroid-ball) any stencil wider than the distance to the crease averages across it:
maxima of 23–170° for ε ≥ 1e-3, while the exact gradient returns the one-sided derivative and agrees
with the float64 reference to 4e-4°. random-1's maxima (exact 0.0098°, relative 0.049; FD up to 1000
relative) sit where the field is steep and float32 cancels; both methods suffer, FD far more. Metric
partials behave the same way: exact and sympy agree with the float64 reference to ~1e-8 (median) and
≤ 2e-6 (max); FD is best around ε = 1e-2 (1e-6–6e-5 median; ε = 0.1 wins on twist and
rotating-hallway, whose entries are quadratic in x and z, ε = 1e-3 on weierstrass-haze), ε = 0.1
fails where the metric varies fastest (max 0.47 on log-periodic, 0.2 on scale-invariant, 0.062 on
schwarzschild-lens), and ε = 1e-4 is rounding-limited at 1e-4–2e-3.

**CPU.** Compiling an expression with its gradient takes 0.05–0.3 ms, with its Hessian 0.06–0.7 ms,
a metric preset 0.08–1.9 ms (city-fold), so recompiling on every keystroke is fine. The emitted JS
runs at 5–30 M evaluations/s with the gradient (275 M/s for the sphere, which V8 inlines) and
4–37 M/s with the Hessian; the interpreter (`evaluate`) walks the graph on every call and manages
25–300 k/s, so hot loops should use `js()`. Our GLSL is 0.46–1.11× the size of sympy's.

## Caveats

- One desktop GPU, one browser, one day. Field rows repeat within 1–2 % between page loads, but the
  large metric programs were bimodal: in one of four runs the `exact`, `sympy` and `fd` rows of
  city-fold, rotating-hallway, gaussian-lens and others came out up to 2× faster (city-fold exact
  0.18 vs 0.37 ns) while `tensor` and every field row were unchanged (a driver re-optimising big
  shaders in the background would look like this). The tables show one of the two runs that agreed
  with each other; the ordering between `exact`, `sympy` and `fd` within a row held in every run.
- WebGPU timestamps are quantized by Chrome; with 32 dispatches per timed pass the quantum is below
  3 % of the shortest pass. The constant presets (euclidean, anisotropic-stretch) are identical across
  variants because their partials fold to zero, in every compiler.
- FD costs are for ε as a uniform and the value as the mean of the taps; a raymarcher that only needs
  the normal at the hit point pays FD once per pixel, not per step, which is the other reason exact
  gradients matter most when they are used every step (step scaling, metric partials along a
  geodesic).
- glsl-autodiff's dual structs and mobile GPUs are not measured yet (roadmap).
