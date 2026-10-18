float f(vec3 p, out vec3 grad) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = u_params.y * t0 - u_params.z * u_time;
    float t2 = 1.0 + t0;
    float t3 = u_params.x * sin(t1) / t2;
    float t4 = 2.0 * t0;
    float t5 = 2.0 * p.x / t4;
    float t6 = cos(t1);
    float t7 = 2.0 * p.y / t4;
    float t8 = 2.0 * p.z / t4;
    grad = vec3((u_params.x * (u_params.y * t5 * t6) - t3 * t5) / t2, (u_params.x * (t6 * (u_params.y * t7)) - t3 * t7) / t2, (u_params.x * (t6 * (u_params.y * t8)) - t3 * t8) / t2);
    return 1.0 + t3;
}
