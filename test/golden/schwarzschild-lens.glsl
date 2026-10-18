float f(vec3 p, out vec3 gradient) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = 2.0 * sqrt(t0 * t0 + u_params.y * u_params.y);
    float t2 = u_params.x / t1;
    float t3 = 1.0 + t2;
    float t4 = t3 * t3;
    float t5 = 2.0 * t0;
    gradient = vec3(-32.0 * (t4 * (t3 * (t2 * (t0 * (p.x / t5) / t1) / t1))), -32.0 * (t4 * (t3 * (t2 * (t0 * (p.y / t5) / t1) / t1))), -32.0 * (t4 * (t3 * (t2 * (t0 * (p.z / t5) / t1) / t1))));
    return t4 * t4;
}
