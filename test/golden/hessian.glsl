float f(vec2 p, out vec2 gradient, out mat2 hessian) {
    float t0 = p.x * p.x;
    float t1 = sin(p.y);
    float t2 = 2.0 * p.x;
    gradient = vec2(p.y * t2, t0 + cos(p.y));
    hessian = mat2(2.0 * p.y, t2, t2, -t1);
    return p.y * t0 + t1;
}
