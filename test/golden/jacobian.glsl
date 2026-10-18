void f(vec2 p, out vec3 value, out mat2x3 jacobian) {
    float t0 = cos(p.y);
    float t1 = p.x * t0;
    float t2 = sin(p.y);
    float t3 = p.x * t2;
    value = vec3(t1, t3, p.x * u_params.x);
    jacobian = mat2x3(t0, t2, u_params.x, -t3, t1, 0.0);
}
