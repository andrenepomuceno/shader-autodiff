mat3 metricTensor(vec3 p) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = 1.0 + u_params.x / (2.0 * sqrt(t0 * t0 + u_params.y * u_params.y));
    float t2 = t1 * t1;
    float t3 = 1.0 - u_morph + u_morph * (t2 * t2);
    return mat3(t3, 0.0, 0.0, 0.0, t3, 0.0, 0.0, 0.0, t3);
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    float t1 = 2.0 * sqrt(t0 * t0 + u_params.y * u_params.y);
    float t2 = u_params.x / t1;
    float t3 = 1.0 + t2;
    float t4 = t3 * t3;
    float t5 = 2.0 * t0;
    float t6 = -(u_morph * (2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.x / t5)) / t1)) / t1))))));
    float t7 = -(u_morph * (2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.y / t5)) / t1)) / t1))))));
    float t8 = -(u_morph * (2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.z / t5)) / t1)) / t1))))));
    dgdx = mat3(t6, 0.0, 0.0, 0.0, t6, 0.0, 0.0, 0.0, t6);
    dgdy = mat3(t7, 0.0, 0.0, 0.0, t7, 0.0, 0.0, 0.0, t7);
    dgdz = mat3(t8, 0.0, 0.0, 0.0, t8, 0.0, 0.0, 0.0, t8);
}
