float f(vec3 p, out vec3 gradient) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = u_params.y * t0 - u_params.z * u_time;
    float t2 = sin(t1);
    float t3 = 1.0 + t0;
    float t4 = t0 * t3;
    float t5 = u_params.x * (t2 / t3 - u_params.y * cos(t1));
    gradient = vec3(-(p.x * t5 / t4), -(p.y * t5 / t4), -(p.z * t5 / t4));
    return 1.0 + u_params.x * t2 / t3;
}
