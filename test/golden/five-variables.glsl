float f(float u, float v, float w, float s, float q, out float gradient[5]) {
    float t0 = sinh(s);
    gradient[0] = v;
    gradient[1] = u;
    gradient[2] = t0;
    gradient[3] = w * cosh(s);
    gradient[4] = -2.0 * q;
    return u * v + w * t0 - q * q;
}
