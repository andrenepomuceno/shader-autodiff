float f(float x, out float gradient, out float hessian) {
    float t0 = exp(x);
    float t1 = x * t0;
    float t2 = t0 + t1;
    gradient = t2;
    hessian = t0 + t2;
    return t1;
}
