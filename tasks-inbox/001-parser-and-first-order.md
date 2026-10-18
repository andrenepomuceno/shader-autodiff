# 001 Parser, JS evaluator and first-order GLSL

- Pratt parser with the allow-list grammar, limits (depth, nodes, exponent size), positioned errors.
- AST → SSA DAG with hash-consing and constant folding.
- Rules table for the metric-shaders function set (sin, cos, tan, exp, log, sqrt, pow, abs, atan,
  atan2, sinh, cosh, tanh, min, max, floor, mod).
- Forward-mode gradient with zero-tangent pruning; GLSL ES 3.00 and JS emitters.
- Tests: parser errors, numeric checks against central differences, golden GLSL.
