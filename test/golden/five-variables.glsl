float f(float u, float v, float w, float s, float q, out float grad[5]) {
    float t0 = sinh(s);
    grad[0] = v;
    grad[1] = u;
    grad[2] = t0;
    grad[3] = w * cosh(s);
    grad[4] = -(2.0 * q);
    return u * v + w * t0 - q * q;
}
