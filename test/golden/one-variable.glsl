float f(float x, out float grad) {
    float t0 = x * x;
    float t1 = 2.0 * x;
    grad = t0 + x * t1 - 2.0 - 1.0 / (1.0 + t0);
    return x * t0 - t1 + atan(1.0, x);
}
