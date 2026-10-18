# 002 metric-shaders equivalence

Generate `metricTensor`/`metricPartials` for every metric-shaders preset and compare against the
sympy-generated GLSL numerically (CPU evaluation at random points, then GPU readback).
