float f(float x, out float gradient, out float hessian) {
    float t0 = exp(x);
    gradient = t0 * (1.0 + x);
    hessian = t0 * (2.0 + x);
    return x * t0;
}
