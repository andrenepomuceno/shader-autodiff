mat3 metricTensor(vec3 p) {
    float t0 = 1.0 + 0.5 * (u_params.x / sqrt(p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y));
    float t1 = t0 * t0;
    float t2 = -(u_morph - 1.0 - u_morph * (t1 * t1));
    return mat3(t2, 0.0, 0.0, 0.0, t2, 0.0, 0.0, 0.0, t2);
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y;
    float t1 = sqrt(t0);
    float t2 = 1.0 + 0.5 * (u_params.x / t1);
    float t3 = t0 * t1;
    float t4 = u_params.x * (u_morph * (t2 * (t2 * t2)));
    float t5 = -2.0 * (p.x * t4 / t3);
    float t6 = -2.0 * (p.y * t4 / t3);
    float t7 = -2.0 * (p.z * t4 / t3);
    dgdx = mat3(t5, 0.0, 0.0, 0.0, t5, 0.0, 0.0, 0.0, t5);
    dgdy = mat3(t6, 0.0, 0.0, 0.0, t6, 0.0, 0.0, 0.0, t6);
    dgdz = mat3(t7, 0.0, 0.0, 0.0, t7, 0.0, 0.0, 0.0, t7);
}
