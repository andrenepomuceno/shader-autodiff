float f(vec3 p, out vec3 gradient) {
    float t0 = u_params.y * u_params.y;
    float t1 = u_params.x * exp(-((p.x * p.x + p.y * p.y + p.z * p.z) / t0));
    gradient = vec3(-2.0 * (p.x * t1 / t0), -2.0 * (p.y * t1 / t0), -2.0 * (p.z * t1 / t0));
    return 1.0 + t1;
}
