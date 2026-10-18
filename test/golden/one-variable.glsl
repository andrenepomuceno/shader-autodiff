float f(float x, out float gradient) {
    float t0 = x * x;
    gradient = 3.0 * t0 - 2.0 - 1.0 / (1.0 + t0);
    return -(2.0 * x - x * t0 - atan(1.0, x));
}
