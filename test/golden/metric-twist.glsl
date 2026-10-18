mat3 metricTensor(vec3 p) {
    float t0 = p.y * u_params.x;
    float t1 = cos(t0);
    float t2 = sin(t0);
    float t3 = p.x * t1 + p.z * t2;
    float t4 = p.x * t2 - p.z * t1;
    float t5 = u_params.x * u_params.x;
    float t6 = -(u_params.x * (u_morph * (t1 * t4 - t2 * t3)));
    float t7 = -(u_params.x * (u_morph * (t2 * t4 + t1 * t3)));
    return mat3(1.0, t6, 0.0, t6, -(u_morph - 1.0 - u_morph * (t4 * t4 * t5 + (1.0 + t5 * (t3 * t3)))), t7, 0.0, t7, 1.0);
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = p.y * u_params.x;
    float t1 = cos(t0);
    float t2 = sin(t0);
    float t3 = p.x * t1 + p.z * t2;
    float t4 = p.x * t2 - p.z * t1;
    float t5 = u_params.x * u_params.x;
    float t6 = u_params.x * u_morph;
    float t7 = -t6;
    dgdx = mat3(0.0, 0.0, 0.0, 0.0, 2.0 * (t5 * (u_morph * (t2 * t4 + t1 * t3))), t7, 0.0, t7, 0.0);
    dgdy = mat3(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    dgdz = mat3(0.0, t6, 0.0, t6, -2.0 * (t5 * (u_morph * (t1 * t4 - t2 * t3))), 0.0, 0.0, 0.0, 0.0);
}
