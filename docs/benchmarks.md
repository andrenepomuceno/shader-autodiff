# Benchmarks

Measured 2026-10-18 on Windows 11 Pro, Intel Core i7-14700K, Chrome 155, Node v24.14.0, on the
second NVIDIA GeForce RTX 5060 Ti of the machine, which drives no monitor (WebGL2 through ANGLE
Direct3D11, WebGPU through Dawn D3D12; the adapter reports `nvidia blackwell`), in a headless Chrome
pinned to it, so the desktop compositor never shares the GPU. Everything here can be rerun:

```bash
npm run bench:gpu -- --adapter=GPU2       # headless, on the GPU you pick (node tools/gpu/check.mjs --list)
npm run bench:gpu -- --adapter=intel --query="size=1024&dispatches=8"   # smaller run for slow GPUs
node tools/bench-cpu.mjs                  # CPU numbers, prints Markdown
node tools/gpu/serve.mjs 8139             # or open http://127.0.0.1:8139/tools/gpu/bench.html yourself
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

**Cost.** A 2048×2048 pass (smaller on slow GPUs, see below); each pixel evaluates its variant at 16 points p + i·δ (i = 0…15) and the
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

WebGL2 on ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Ti (0x00002D04) Direct3D11 vs_5_0 ps_5_0, D3D11). Timing: EXT_disjoint_timer_query_webgl2. 2048×2048 target, 16 evaluations per pixel per frame, median of 15 frames; ns per pixel (16 evaluations; ms per frame = ns × 4.19). Baseline (no evaluation): 0.00951 ns.

| Field           | value (ns) | exact (ns, ×value) | fd4 (ns, ×value) | fd6 (ns, ×value) |
| --------------- | ---------- | ------------------ | ---------------- | ---------------- |
| sphere          | 0.0144     | 0.0227 (×1.58)     | 0.0552 (×3.84)   | 0.0681 (×4.74)   |
| torus-ball-smin | 0.0481     | 0.137 (×2.85)      | 0.174 (×3.61)    | 0.267 (×5.54)    |
| gyroid-ball     | 0.0710     | 0.0902 (×1.27)     | 0.174 (×2.45)    | 0.246 (×3.46)    |
| blobs-lse       | 0.0794     | 0.124 (×1.56)      | 0.299 (×3.77)    | 0.472 (×5.95)    |
| schwarzschild   | 0.0179     | 0.0359 (×2.01)     | 0.0804 (×4.50)   | 0.0966 (×5.41)   |
| random-1        | 0.156      | 0.301 (×1.93)      | 0.486 (×3.11)    | 0.661 (×4.23)    |
| random-2        | 0.0984     | 0.168 (×1.70)      | 0.246 (×2.50)    | 0.343 (×3.49)    |
| random-3        | 0.190      | 0.291 (×1.53)      | 0.538 (×2.83)    | 0.752 (×3.95)    |

| Metric preset           | tensor (ns) | exact (ns, ×tensor) | sympy (ns, ×tensor) | fd (ns, ×tensor) |
| ----------------------- | ----------- | ------------------- | ------------------- | ---------------- |
| anisotropic-stretch     | 0.00874     | 0.00877 (×1.00)     | 0.00877 (×1.00)     | 0.00877 (×1.00)  |
| city-fold               | 0.168       | 0.487 (×2.90)       | 0.499 (×2.97)       | 0.736 (×4.37)    |
| euclidean               | 0.00875     | 0.00874 (×1.00)     | 0.00875 (×1.00)     | 0.00876 (×1.00)  |
| expanding-shell         | 0.0284      | 0.0611 (×2.15)      | 0.0584 (×2.06)      | 0.163 (×5.73)    |
| gaussian-lens           | 0.0222      | 0.0523 (×2.36)      | 0.0466 (×2.10)      | 0.112 (×5.05)    |
| log-periodic            | 0.0284      | 0.0630 (×2.22)      | 0.0588 (×2.07)      | 0.166 (×5.84)    |
| mirage                  | 0.0389      | 0.0870 (×2.24)      | 0.0801 (×2.06)      | 0.147 (×3.79)    |
| poincare-ball           | 0.0275      | 0.0592 (×2.15)      | 0.0563 (×2.05)      | 0.157 (×5.72)    |
| ripple                  | 0.0245      | 0.0577 (×2.35)      | 0.0509 (×2.08)      | 0.0879 (×3.59)   |
| rotating-hallway        | 0.0634      | 0.115 (×1.81)       | 0.133 (×2.10)       | 0.310 (×4.89)    |
| scale-invariant         | 0.0237      | 0.0523 (×2.21)      | 0.0499 (×2.11)      | 0.162 (×6.83)    |
| schwarzschild-lens      | 0.0234      | 0.0583 (×2.50)      | 0.0544 (×2.33)      | 0.127 (×5.44)    |
| spherical-stereographic | 0.0207      | 0.0504 (×2.43)      | 0.0441 (×2.12)      | 0.107 (×5.15)    |
| twist                   | 0.0469      | 0.0586 (×1.25)      | 0.0635 (×1.35)      | 0.262 (×5.59)    |
| wave-pullback           | 0.0236      | 0.0413 (×1.76)      | 0.0410 (×1.74)      | 0.0638 (×2.71)   |
| weierstrass-haze        | 0.116       | 0.257 (×2.22)       | 0.236 (×2.03)       | 0.577 (×4.97)    |
| wormhole-like           | 0.0216      | 0.0530 (×2.45)      | 0.0463 (×2.14)      | 0.114 (×5.27)    |

## Precision in float32 (WebGL2)

Normal angle error in degrees (median / max over 4096 points):

| Field           | exact                 | fd4 ε=0.1 | fd4 ε=0.01  | fd4 ε=0.001  | fd4 ε=0.0001  | fd6 ε=0.1    | fd6 ε=0.01       | fd6 ε=0.001    | fd6 ε=0.0001 |
| --------------- | --------------------- | --------- | ----------- | ------------ | ------------- | ------------ | ---------------- | -------------- | ------------ |
| sphere          | 8.5e-7 / 0.0000026    | 1 / 7.9   | 0.1 / 1.4   | 0.01 / 0.15  | 0.019 / 0.081 | 0.013 / 3    | 0.00035 / 0.053  | 0.0027 / 0.011 | 0.026 / 0.11 |
| torus-ball-smin | 0.0000065 / 0.00011   | 4.1 / 120 | 0.35 / 110  | 0.035 / 62   | 0.02 / 0.14   | 0.073 / 86   | 0.00062 / 71     | 0.0026 / 35    | 0.024 / 0.18 |
| gyroid-ball     | 8.5e-7 / 0.00038      | 1 / 170   | 0.1 / 150   | 0.01 / 50    | 0.02 / 0.43   | 0.011 / 130  | 0.0003 / 67      | 0.0027 / 23    | 0.025 / 0.11 |
| blobs-lse       | 0.0000051 / 0.000051  | 1.3 / 43  | 0.13 / 5.6  | 0.014 / 0.64 | 0.024 / 0.13  | 0.052 / 4.6  | 0.00075 / 0.05   | 0.0034 / 0.023 | 0.033 / 0.18 |
| schwarzschild   | 0.0000012 / 0.0000044 | 3.1 / 9.7 | 0.31 / 1.1  | 0.041 / 0.13 | 0.21 / 1.2    | 0.069 / 0.57 | 0.0033 / 0.019   | 0.029 / 0.2    | 0.29 / 1.7   |
| random-1        | 0.000047 / 0.0097     | 7.5 / 180 | 0.71 / 170  | 0.071 / 160  | 0.023 / 140   | 0.28 / 170   | 0.003 / 170      | 0.0022 / 170   | 0.016 / 17   |
| random-2        | 0.0000035 / 0.000029  | 1.9 / 4.6 | 0.19 / 0.46 | 0.02 / 0.051 | 0.025 / 0.25  | 0.09 / 0.67  | 0.00095 / 0.0076 | 0.0027 / 0.03  | 0.026 / 0.34 |
| random-3        | 0.0000098 / 0.000073  | 2.3 / 6.7 | 0.21 / 0.7  | 0.027 / 0.11 | 0.12 / 0.77   | 0.17 / 1.2   | 0.0025 / 0.014   | 0.015 / 0.097  | 0.15 / 0.97  |

Gradient error relative to 1 + max|ref| (median / max over 4096 points):

| Field           | exact              | fd4 ε=0.1      | fd4 ε=0.01      | fd4 ε=0.001       | fd4 ε=0.0001      | fd6 ε=0.1       | fd6 ε=0.01          | fd6 ε=0.001        | fd6 ε=0.0001      |
| --------------- | ------------------ | -------------- | --------------- | ----------------- | ----------------- | --------------- | ------------------- | ------------------ | ----------------- |
| sphere          | 1.6e-8 / 6.5e-8    | 0.011 / 0.2    | 0.0011 / 0.014  | 0.00012 / 0.0014  | 0.00021 / 0.00091 | 0.00024 / 0.047 | 0.0000048 / 0.00055 | 0.000033 / 0.00012 | 0.00027 / 0.00097 |
| torus-ball-smin | 7.5e-8 / 0.000001  | 0.046 / 0.71   | 0.0043 / 0.56   | 0.00043 / 0.37    | 0.00024 / 0.0012  | 0.00099 / 0.73  | 0.0000091 / 0.56    | 0.000033 / 0.36    | 0.00028 / 0.0015  |
| gyroid-ball     | 1.8e-8 / 0.0000011 | 0.011 / 0.84   | 0.0011 / 0.59   | 0.00012 / 0.3     | 0.00023 / 0.00086 | 0.00024 / 0.57  | 0.0000049 / 0.48    | 0.000032 / 0.24    | 0.00027 / 0.00097 |
| blobs-lse       | 5.1e-8 / 3.8e-7    | 0.013 / 0.26   | 0.0013 / 0.033  | 0.00014 / 0.0034  | 0.00026 / 0.0018  | 0.00064 / 0.096 | 0.0000088 / 0.0011  | 0.000038 / 0.00019 | 0.00034 / 0.002   |
| schwarzschild   | 2e-8 / 2.2e-7      | 0.015 / 0.17   | 0.0015 / 0.018  | 0.0002 / 0.0018   | 0.0011 / 0.003    | 0.00031 / 0.047 | 0.000017 / 0.0005   | 0.00015 / 0.00038  | 0.0015 / 0.0037   |
| random-1        | 0.0000013 / 0.049  | 0.047 / 1000   | 0.0046 / 50     | 0.00046 / 3.6     | 0.00025 / 1.7     | 0.0068 / 470    | 0.000067 / 72       | 0.000031 / 21      | 0.00024 / 2       |
| random-2        | 3.2e-8 / 2.5e-7    | 0.011 / 0.05   | 0.0011 / 0.005  | 0.00011 / 0.00053 | 0.00018 / 0.0012  | 0.0013 / 0.013  | 0.000013 / 0.00013  | 0.00002 / 0.000098 | 0.00019 / 0.0012  |
| random-3        | 7.5e-8 / 3.9e-7    | 0.0093 / 0.066 | 0.0009 / 0.0068 | 0.00011 / 0.00068 | 0.00059 / 0.0021  | 0.0011 / 0.011  | 0.000014 / 0.00011  | 0.000073 / 0.00022 | 0.00071 / 0.0022  |

Metric partials error relative to 1 + max|ref| (median / max over 4096 points):

| Metric preset           | exact              | sympy              | fd ε=0.1            | fd ε=0.01             | fd ε=0.001           | fd ε=0.0001        |
| ----------------------- | ------------------ | ------------------ | ------------------- | --------------------- | -------------------- | ------------------ |
| anisotropic-stretch     | 0 / 0              | 0 / 0              | 0 / 0               | 0 / 0                 | 0 / 0                | 0 / 0              |
| city-fold               | 6e-9 / 4.2e-8      | 1.2e-8 / 8.4e-8    | 0.000012 / 0.00014  | 0.0000063 / 0.000031  | 0.000061 / 0.00025   | 0.00058 / 0.0026   |
| euclidean               | 0 / 0              | 0 / 0              | 0 / 0               | 0 / 0                 | 0 / 0                | 0 / 0              |
| expanding-shell         | 7.6e-10 / 5e-7     | 7.7e-10 / 5.1e-7   | 0.000087 / 0.0026   | 0.0000072 / 0.00005   | 0.000056 / 0.00034   | 0.00047 / 0.0036   |
| gaussian-lens           | 4.5e-8 / 2e-7      | 4.3e-8 / 2.2e-7    | 0.00039 / 0.0011    | 0.00001 / 0.000065    | 0.000096 / 0.00073   | 0.001 / 0.0049     |
| log-periodic            | 8.5e-8 / 0.0000012 | 8.8e-8 / 0.0000017 | 0.00062 / 0.47      | 0.0000093 / 0.0057    | 0.000041 / 0.00025   | 0.00041 / 0.0028   |
| mirage                  | 9.5e-11 / 1.4e-8   | 9.5e-11 / 1.4e-8   | 0.000036 / 0.00094  | 0.0000015 / 0.000012  | 0.00001 / 0.00003    | 0.000072 / 0.0003  |
| poincare-ball           | 1.6e-8 / 1.2e-7    | 1.6e-8 / 1.2e-7    | 0.000027 / 0.000032 | 0.0000061 / 0.000028  | 0.000062 / 0.00031   | 0.00061 / 0.0031   |
| ripple                  | 5.9e-8 / 3.5e-7    | 5.9e-8 / 3.4e-7    | 0.00031 / 0.00066   | 0.0000044 / 0.000023  | 0.000035 / 0.00022   | 0.00035 / 0.0017   |
| rotating-hallway        | 7.4e-9 / 3.4e-8    | 1.5e-8 / 4.7e-8    | 4e-7 / 0.0000016    | 0.0000029 / 0.0000064 | 0.000029 / 0.000077  | 0.00029 / 0.00072  |
| scale-invariant         | 6e-9 / 4.3e-7      | 4.4e-9 / 2.2e-7    | 0.000054 / 0.2      | 9.1e-7 / 0.0018       | 0.0000072 / 0.000052 | 0.000073 / 0.00043 |
| schwarzschild-lens      | 3.2e-8 / 2.7e-7    | 4.2e-8 / 3.6e-7    | 0.00025 / 0.062     | 0.000021 / 0.00065    | 0.00018 / 0.00053    | 0.0018 / 0.005     |
| spherical-stereographic | 2.7e-8 / 1.2e-7    | 2.7e-8 / 1.1e-7    | 0.00015 / 0.00024   | 0.000011 / 0.000048   | 0.0001 / 0.00053     | 0.0011 / 0.0047    |
| twist                   | 3.2e-8 / 1.4e-7    | 3.7e-8 / 1.4e-7    | 4.3e-7 / 0.000002   | 0.0000039 / 0.000017  | 0.00004 / 0.00018    | 0.0004 / 0.0024    |
| wave-pullback           | 8.9e-8 / 7.4e-7    | 8.9e-8 / 7.4e-7    | 0.0019 / 0.0026     | 0.000019 / 0.000043   | 0.000026 / 0.00013   | 0.00028 / 0.0018   |
| weierstrass-haze        | 9.6e-8 / 6e-7      | 9.6e-8 / 6.1e-7    | 0.006 / 0.011       | 0.000062 / 0.00012    | 0.000023 / 0.000085  | 0.00023 / 0.00085  |
| wormhole-like           | 1.5e-8 / 2.8e-7    | 1.5e-8 / 2.6e-7    | 0.00019 / 0.019     | 0.0000082 / 0.0002    | 0.000067 / 0.00019   | 0.00067 / 0.0018   |

## GPU cost, WebGPU

WebGPU on nvidia blackwell. Timing: timestamp-query around compute passes of 32 dispatches. Compute shader, same workload. Baseline: 0.0148 ns.

| Field           | value (ns) | exact (ns, ×value) | fd4 (ns, ×value) | fd6 (ns, ×value) |
| --------------- | ---------- | ------------------ | ---------------- | ---------------- |
| sphere          | 0.0216     | 0.0375 (×1.74)     | 0.0900 (×4.17)   | 0.112 (×5.18)    |
| torus-ball-smin | 0.0674     | 0.192 (×2.84)      | 0.265 (×3.93)    | 0.350 (×5.19)    |
| gyroid-ball     | 0.0726     | 0.107 (×1.47)      | 0.215 (×2.96)    | 0.369 (×5.09)    |
| blobs-lse       | 0.0853     | 0.161 (×1.88)      | 0.338 (×3.96)    | 0.516 (×6.05)    |
| schwarzschild   | 0.0250     | 0.0494 (×1.98)     | 0.108 (×4.30)    | 0.136 (×5.41)    |
| random-1        | 0.163      | 0.312 (×1.92)      | 0.514 (×3.16)    | 0.823 (×5.06)    |
| random-2        | 0.0921     | 0.165 (×1.80)      | 0.242 (×2.62)    | 0.417 (×4.52)    |
| random-3        | 0.129      | 0.226 (×1.75)      | 0.378 (×2.93)    | 0.628 (×4.86)    |

| Metric preset           | tensor (ns) | exact (ns, ×tensor) | fd (ns, ×tensor) |
| ----------------------- | ----------- | ------------------- | ---------------- |
| anisotropic-stretch     | 0.00470     | 0.00470 (×1.00)     | 0.00466 (×0.99)  |
| city-fold               | 0.194       | 0.561 (×2.89)       | 1.07 (×5.52)     |
| euclidean               | 0.00471     | 0.00470 (×1.00)     | 0.00471 (×1.00)  |
| expanding-shell         | 0.0447      | 0.120 (×2.67)       | 0.254 (×5.68)    |
| gaussian-lens           | 0.0397      | 0.108 (×2.73)       | 0.212 (×5.35)    |
| log-periodic            | 0.0454      | 0.112 (×2.47)       | 0.263 (×5.79)    |
| mirage                  | 0.0498      | 0.132 (×2.64)       | 0.270 (×5.41)    |
| poincare-ball           | 0.0412      | 0.115 (×2.80)       | 0.233 (×5.67)    |
| ripple                  | 0.0366      | 0.0964 (×2.63)      | 0.198 (×5.41)    |
| rotating-hallway        | 0.0825      | 0.152 (×1.85)       | 0.467 (×5.66)    |
| scale-invariant         | 0.0371      | 0.102 (×2.76)       | 0.222 (×6.00)    |
| schwarzschild-lens      | 0.0397      | 0.113 (×2.84)       | 0.218 (×5.49)    |
| spherical-stereographic | 0.0371      | 0.106 (×2.85)       | 0.203 (×5.46)    |
| twist                   | 0.0713      | 0.0919 (×1.29)      | 0.400 (×5.60)    |
| wave-pullback           | 0.0317      | 0.0650 (×2.05)      | 0.156 (×4.93)    |
| weierstrass-haze        | 0.144       | 0.323 (×2.25)       | 0.925 (×6.43)    |
| wormhole-like           | 0.0386      | 0.110 (×2.86)       | 0.207 (×5.36)    |

## CPU (`node tools/bench-cpu.mjs`)

Node v24.14.0 on Intel(R) Core(TM) i7-14700K, 2026-10-18. Compile times are medians of 50 runs; throughput is over ≥ 300 ms of evaluations at 64 random points.

| Field           | compile, gradient (ms) | emit GLSL (ms) | compile, Hessian (ms) | GLSL lines (gradient) |
| --------------- | ---------------------- | -------------- | --------------------- | --------------------- |
| sphere          | 0.094                  | 0.013          | 0.129                 | 6                     |
| torus-ball-smin | 0.611                  | 0.056          | 1.381                 | 37                    |
| gyroid-ball     | 0.176                  | 0.028          | 0.330                 | 20                    |
| blobs-lse       | 0.473                  | 0.028          | 1.131                 | 25                    |
| schwarzschild   | 0.125                  | 0.011          | 0.393                 | 11                    |
| random-1        | 0.425                  | 0.039          | 2.023                 | 35                    |
| random-2        | 0.216                  | 0.029          | 0.795                 | 21                    |
| random-3        | 0.288                  | 0.027          | 1.150                 | 24                    |

| Field           | evaluate (k/s) | emitted JS (M/s) | evaluate + Hessian (k/s) | emitted JS + Hessian (M/s) |
| --------------- | -------------- | ---------------- | ------------------------ | -------------------------- |
| sphere          | 473            | 293.2            | 141                      | 39.7                       |
| torus-ball-smin | 55             | 23.2             | 17                       | 15.5                       |
| gyroid-ball     | 123            | 19.2             | 56                       | 15.3                       |
| blobs-lse       | 75             | 12.2             | 23                       | 8.6                        |
| schwarzschild   | 225            | 67.4             | 71                       | 35.4                       |
| random-1        | 50             | 11.1             | 13                       | 7.1                        |
| random-2        | 96             | 15.2             | 29                       | 12.0                       |
| random-3        | 72             | 11.1             | 19                       | 8.0                        |

| Metric preset           | compileMetric (ms) | GLSL ours         | GLSL sympy         | ours / sympy |
| ----------------------- | ------------------ | ----------------- | ------------------ | ------------ |
| anisotropic-stretch     | 0.086              | 455 B, 10 lines   | 480 B, 11 lines    | 0.95         |
| city-fold               | 2.832              | 5776 B, 105 lines | 11359 B, 161 lines | 0.51         |
| euclidean               | 0.034              | 356 B, 10 lines   | 356 B, 10 lines    | 1.00         |
| expanding-shell         | 0.310              | 983 B, 22 lines   | 1213 B, 21 lines   | 0.81         |
| gaussian-lens           | 0.208              | 800 B, 18 lines   | 967 B, 18 lines    | 0.83         |
| log-periodic            | 0.225              | 775 B, 16 lines   | 955 B, 16 lines    | 0.81         |
| mirage                  | 0.260              | 1077 B, 22 lines  | 1328 B, 23 lines   | 0.81         |
| poincare-ball           | 0.276              | 875 B, 21 lines   | 1137 B, 21 lines   | 0.77         |
| ripple                  | 0.147              | 834 B, 19 lines   | 977 B, 19 lines    | 0.85         |
| rotating-hallway        | 0.536              | 1594 B, 36 lines  | 3203 B, 43 lines   | 0.50         |
| scale-invariant         | 0.156              | 696 B, 15 lines   | 865 B, 16 lines    | 0.80         |
| schwarzschild-lens      | 0.254              | 878 B, 21 lines   | 1058 B, 18 lines   | 0.83         |
| spherical-stereographic | 0.178              | 769 B, 18 lines   | 965 B, 18 lines    | 0.80         |
| twist                   | 0.370              | 1067 B, 26 lines  | 1684 B, 26 lines   | 0.63         |
| wave-pullback           | 0.140              | 793 B, 16 lines   | 898 B, 13 lines    | 0.88         |
| weierstrass-haze        | 1.429              | 2955 B, 50 lines  | 3658 B, 50 lines   | 0.81         |
| wormhole-like           | 0.203              | 815 B, 19 lines   | 1005 B, 18 lines   | 0.81         |

## Before and after the algebraic normal form

Same machine, same headless GPU, WebGL2; `before` is v0.1.0.

| Metric preset | sympy (ns) | before (ns, ×sympy) | after (ns, ×sympy) |
| --- | --- | --- | --- |
| city-fold | 0.499 | 0.37 (×0.74) | 0.487 (×0.98) |
| expanding-shell | 0.0584 | 0.0843 (×1.45) | 0.0611 (×1.05) |
| gaussian-lens | 0.0466 | 0.0765 (×1.65) | 0.0523 (×1.12) |
| log-periodic | 0.0588 | 0.0667 (×1.14) | 0.063 (×1.07) |
| mirage | 0.0801 | 0.0809 (×1.01) | 0.087 (×1.09) |
| poincare-ball | 0.0563 | 0.089 (×1.58) | 0.0592 (×1.05) |
| ripple | 0.0509 | 0.0572 (×1.13) | 0.0577 (×1.13) |
| rotating-hallway | 0.133 | 0.159 (×1.20) | 0.115 (×0.86) |
| scale-invariant | 0.0499 | 0.0728 (×1.46) | 0.0523 (×1.05) |
| schwarzschild-lens | 0.0544 | 0.0933 (×1.72) | 0.0583 (×1.07) |
| spherical-stereographic | 0.0441 | 0.0765 (×1.73) | 0.0504 (×1.14) |
| twist | 0.0635 | 0.134 (×2.10) | 0.0586 (×0.92) |
| wave-pullback | 0.041 | 0.0366 (×0.89) | 0.0413 (×1.01) |
| weierstrass-haze | 0.236 | 0.252 (×1.08) | 0.257 (×1.09) |
| wormhole-like | 0.0463 | 0.0703 (×1.51) | 0.053 (×1.14) |
| **median / max** | | ×1.45 / ×2.10 | ×1.07 / ×1.14 |

| Field | value (ns) | exact before (ns) | exact after (ns) | change |
| --- | --- | --- | --- | --- |
| sphere | 0.0144 | 0.0304 | 0.0227 | -25 % |
| torus-ball-smin | 0.0481 | 0.166 | 0.137 | -17 % |
| gyroid-ball | 0.071 | 0.102 | 0.0902 | -12 % |
| blobs-lse | 0.0794 | 0.133 | 0.124 | -7 % |
| schwarzschild | 0.0179 | 0.0424 | 0.0359 | -15 % |
| random-1 | 0.156 | 0.27 | 0.301 | +11 % |
| random-2 | 0.0984 | 0.162 | 0.168 | +4 % |
| random-3 | 0.19 | 0.257 | 0.291 | +13 % |

## Integrated GPU (Intel UHD Graphics 770)

The same benchmark on the CPU's integrated GPU, headless, at 1024×1024 (`--query="size=1024&dispatches=8"`;
costs are still per pixel). Timing: EXT_disjoint_timer_query_webgl2. 1024×1024 target, 16 evaluations per pixel per frame, median of 15 frames; ns per pixel (16 evaluations; ms per frame = ns × 1.05). Baseline (no evaluation): 1.05 ns.

| Field           | value (ns) | exact (ns, ×value) | fd4 (ns, ×value) | fd6 (ns, ×value) |
| --------------- | ---------- | ------------------ | ---------------- | ---------------- |
| sphere          | 0.372      | 0.535 (×1.44)      | 1.66 (×4.46)     | 1.59 (×4.27)     |
| torus-ball-smin | 1.23       | 4.07 (×3.32)       | 4.68 (×3.82)     | 6.26 (×5.11)     |
| gyroid-ball     | 0.949      | 1.80 (×1.90)       | 3.27 (×3.44)     | 4.12 (×4.34)     |
| blobs-lse       | 1.44       | 2.60 (×1.81)       | 5.64 (×3.91)     | 7.59 (×5.26)     |
| schwarzschild   | 0.744      | 1.43 (×1.92)       | 3.42 (×4.60)     | 4.00 (×5.37)     |
| random-1        | 2.50       | 5.26 (×2.10)       | 8.50 (×3.40)     | 11.0 (×4.38)     |
| random-2        | 1.53       | 2.76 (×1.81)       | 4.34 (×2.84)     | 5.39 (×3.53)     |
| random-3        | 2.91       | 4.72 (×1.62)       | 8.11 (×2.79)     | 11.6 (×3.98)     |

| Metric preset           | tensor (ns) | exact (ns, ×tensor) | sympy (ns, ×tensor) | fd (ns, ×tensor) |
| ----------------------- | ----------- | ------------------- | ------------------- | ---------------- |
| anisotropic-stretch     | 0.0810      | 0.0820 (×1.01)      | 0.0815 (×1.01)      | 0.0810 (×1.00)   |
| city-fold               | 3.09        | 10.6 (×3.42)        | 10.9 (×3.52)        | 13.5 (×4.39)     |
| euclidean               | 0.0816      | 0.0808 (×0.99)      | 0.0812 (×1.00)      | 0.0809 (×0.99)   |
| expanding-shell         | 0.763       | 1.86 (×2.44)        | 1.77 (×2.33)        | 4.36 (×5.72)     |
| gaussian-lens           | 0.611       | 1.63 (×2.67)        | 1.43 (×2.34)        | 3.39 (×5.55)     |
| log-periodic            | 0.686       | 1.63 (×2.38)        | 1.55 (×2.27)        | 3.87 (×5.65)     |
| mirage                  | 0.856       | 2.07 (×2.42)        | 2.01 (×2.35)        | 3.58 (×4.18)     |
| poincare-ball           | 0.645       | 1.75 (×2.71)        | 1.70 (×2.63)        | 3.48 (×5.39)     |
| ripple                  | 0.497       | 1.35 (×2.72)        | 1.15 (×2.31)        | 2.00 (×4.01)     |
| rotating-hallway        | 1.39        | 2.84 (×2.05)        | 3.36 (×2.42)        | 7.66 (×5.51)     |
| scale-invariant         | 0.553       | 1.43 (×2.58)        | 1.30 (×2.34)        | 3.09 (×5.58)     |
| schwarzschild-lens      | 0.662       | 1.74 (×2.62)        | 1.56 (×2.36)        | 3.69 (×5.57)     |
| spherical-stereographic | 0.586       | 1.51 (×2.58)        | 1.27 (×2.17)        | 3.14 (×5.36)     |
| twist                   | 1.28        | 1.71 (×1.34)        | 1.87 (×1.46)        | 7.90 (×6.18)     |
| wave-pullback           | 0.647       | 1.17 (×1.80)        | 1.16 (×1.79)        | 1.67 (×2.58)     |
| weierstrass-haze        | 1.97        | 5.50 (×2.80)        | 4.66 (×2.37)        | 10.6 (×5.39)     |
| wormhole-like           | 0.572       | 1.55 (×2.71)        | 1.36 (×2.39)        | 3.15 (×5.51)     |

The picture matches the discrete GPU: the exact gradient costs 1.4–3.3× the value against 2.8–4.6×
for the 4-tap stencil and 3.5–5.4× for central differences, and metric partials cost a median
1.05× the sympy GLSL (max 1.19×), faster on
city-fold, rotating-hallway, twist, and 2–5× cheaper than FD.

## Reading the numbers

**Exact gradients are cheaper than finite differences.** On WebGL2 the exact gradient costs
1.3–2.9× the value alone, the 4-tap stencil 2.4–4.5× and central differences 3.5–6.0× (WebGPU is
similar). The gradient shares every subexpression with the value (each `sin`, `exp`, `sqrt` is
computed once), so its extra cost is a few multiply-adds per node and variable, while FD re-evaluates
everything. The margin is widest on smooth, transcendental-heavy fields (blobs-lse, gyroid-ball) and
narrowest on branchy ones: torus-ball-smin (`abs`, `max`, `clamp`, `mix`) pays a `select` per branch
and gradient component and comes out close to the 4-tap stencil.

**Metric partials: on par with the sympy compiler, far ahead of FD.** Since the algebraic normal
form (see the before/after table), `metricTensor` + `metricPartials` costs a median 1.07× the
sympy-generated GLSL (at most 1.14×) and is faster on twist, rotating-hallway and city-fold; it is
1.5–4.5× cheaper than the 6-evaluation FD on every non-constant preset. What closed the gap: like terms
now cancel (twist's `dgdy` is identically zero, as sympy finds), `sqrt(q)²` collapses the
`r = sqrt(x² + y² + z²)` chains, a sum and its negation or scalar multiples share one node, and
products put the shared factor first so the three partials of a radial metric reuse it. What remains:
sympy also expands and refactors products of sums (`sin·(x sin − z cos) + cos·(x cos + z sin) = x`),
which we deliberately do not do, because expansion can grow the code.

**Precision: exact derivatives are at float32 rounding; FD needs an ε that is wrong somewhere.** The
exact gradient's normal is off by 1e-6–1e-5° (median) and its relative error is at the rounding of
the float32 evaluation itself; on the metric presets ours and sympy's agree with the float64
reference to the same ~1e-8 (ours slightly better on city-fold and rotating-hallway). FD error is
U-shaped in ε: the tetrahedron stencil is first order (1°, 0.1°, 0.01° at ε = 0.1, 0.01, 0.001 on
the sphere, then rounding takes over), central differences are second order but rounding-limited by
ε = 1e-3, the best ε differs per field, and the best FD result is still hundreds of times the exact
error. At the creases of `abs`/`max` any stencil wider than the distance to the crease averages
across it (maxima of 60–170°), while the exact gradient returns the one-sided derivative.

**CPU.** The algebra made compiling 2–4× slower than before, still well under a frame: 0.1–0.5 ms
for an expression with its gradient, up to ~2 ms with the Hessian, a metric preset 0.1–4 ms
(city-fold). The emitted JS runs at millions of evaluations per second; the interpreter (`evaluate`)
walks the graph on every call and is ~100× slower, so hot loops should use `js()`.

## Caveats

- Three GPUs of one machine (two identical discrete, one integrated), one browser, one day. On the monitorless GPU field rows repeat within
  1–2 % between runs; on the display GPU the large metric programs were bimodal across page loads
  (up to 2× apart), which the headless runs on the second GPU avoid.
- The algebraic normal form re-expresses quotients: the derivative of a/b becomes a·db/b² instead of
  reusing a/b, which made the random expressions 4–13 % slower while every SDF got cheaper.
- WebGPU timestamps are quantized by Chrome; with 32 dispatches per timed pass the quantum is below
  3 % of the shortest pass. The constant presets (euclidean, anisotropic-stretch) are identical across
  variants because their partials fold to zero, in every compiler.
- FD costs are for ε as a uniform and the value as the mean of the taps; a raymarcher that only needs
  the normal at the hit point pays FD once per pixel, not per step, which is why exact gradients
  matter most when they are used every step (step scaling, metric partials along a geodesic).
- glsl-autodiff's dual structs and mobile GPUs are not measured yet (roadmap).
