float f(vec3 p, out vec3 gradient) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = u_params.y * u_params.y;
    float t2 = exp(-(t0 * t0 / t1));
    float t3 = 2.0 * t0;
    gradient = vec3(-4.0 * (u_params.x * (t2 * (t0 * (p.x / t3) / t1))), -4.0 * (u_params.x * (t2 * (t0 * (p.y / t3) / t1))), -4.0 * (u_params.x * (t2 * (t0 * (p.z / t3) / t1))));
    return 1.0 + u_params.x * t2;
}
