mat3 metricTensor(vec3 p) {
    float t0 = p.z * u_params.w - u_params.y * u_time;
    float t1 = p.z * u_params.x + u_params.z * sin(t0);
    float t2 = cos(t1);
    float t3 = sin(t1);
    float t4 = p.x * t2 - p.y * t3;
    float t5 = p.x * t3 + p.y * t2;
    float t6 = u_params.x + u_params.z * (u_params.w * cos(t0));
    float t7 = t6 * t6;
    float t8 = -(u_morph * (t6 * (t2 * t5 - t3 * t4)));
    float t9 = u_morph * (t6 * (t2 * t4 + t3 * t5));
    return mat3(1.0, 0.0, t8, 0.0, 1.0, t9, t8, t9, -(u_morph - 1.0 - u_morph * (t7 * (t5 * t5) + (1.0 + t7 * (t4 * t4)))));
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = p.z * u_params.w - u_params.y * u_time;
    float t1 = sin(t0);
    float t2 = p.z * u_params.x + u_params.z * t1;
    float t3 = cos(t2);
    float t4 = sin(t2);
    float t5 = p.x * t3 - p.y * t4;
    float t6 = p.x * t4 + p.y * t3;
    float t7 = u_params.x + u_params.z * (u_params.w * cos(t0));
    float t8 = t3 * t6 - t4 * t5;
    float t9 = t3 * t5 + t4 * t6;
    float t10 = t7 * t7;
    float t11 = u_morph * t7;
    float t12 = -t11;
    float t13 = u_params.w * u_params.w;
    float t14 = u_params.z * (t13 * (u_morph * (t1 * t8)));
    float t15 = -(u_params.z * (t13 * (u_morph * (t1 * t9))));
    dgdx = mat3(0.0, 0.0, 0.0, 0.0, 0.0, t11, 0.0, t11, 2.0 * (u_morph * (t9 * t10)));
    dgdy = mat3(0.0, 0.0, t12, 0.0, 0.0, 0.0, t12, 0.0, 2.0 * (u_morph * (t8 * t10)));
    dgdz = mat3(0.0, 0.0, t14, 0.0, 0.0, t15, t14, t15, -2.0 * (u_params.z * (t13 * (u_morph * (t1 * (t7 * (t6 * t6 + t5 * t5)))))));
}
