float f(vec3 p, out vec3 gradient) {
    float t0 = p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y;
    float t1 = sqrt(t0);
    float t2 = 1.0 + 0.5 * (u_params.x / t1);
    float t3 = t2 * t2;
    float t4 = t0 * t1;
    float t5 = u_params.x * (t2 * t3);
    gradient = vec3(-2.0 * (p.x * t5 / t4), -2.0 * (p.y * t5 / t4), -2.0 * (p.z * t5 / t4));
    return t3 * t3;
}
