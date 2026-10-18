float f(float x, out float gradient) {
    float t0 = x * x;
    gradient = t0 + 2.0 * t0 - 2.0 - 1.0 / (1.0 + t0);
    return x * t0 - 2.0 * x + atan(1.0, x);
}
