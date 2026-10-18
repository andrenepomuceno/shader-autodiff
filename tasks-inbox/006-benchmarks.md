# 006 Precision and performance benchmarks

- GPU cost per pixel (WebGL2 and WebGPU): SDF value only, value + exact gradient, 4-tap
  tetrahedral and 6-tap central finite differences; metric presets: ours vs sympy-generated
  metricTensor/metricPartials vs finite-difference partials.
- Precision on the GPU in float32: normal / partials error of finite differences for several ε
  against the exact result (float64 reference), next to our exact error.
- CPU: compile time per expression and preset, JS evaluate throughput, emitted size vs sympy.
- Results with hardware and date in docs/benchmarks.md; harness under tools/ so anyone can rerun.
