float f(vec3 p, out vec3 gradient) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = u_params.y * t0 - u_params.z * u_time;
    float t2 = 1.0 + t0;
    float t3 = u_params.x * sin(t1) / t2;
    float t4 = 2.0 * t0;
    float t5 = p.x / t4;
    float t6 = cos(t1);
    float t7 = p.y / t4;
    float t8 = p.z / t4;
    gradient = vec3((2.0 * (u_params.x * (u_params.y * t5 * t6)) - 2.0 * (t3 * t5)) / t2, (2.0 * (u_params.x * (t6 * (u_params.y * t7))) - 2.0 * (t3 * t7)) / t2, (2.0 * (u_params.x * (t6 * (u_params.y * t8))) - 2.0 * (t3 * t8)) / t2);
    return 1.0 + t3;
}
