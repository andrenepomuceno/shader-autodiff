mat3 metricTensor(vec3 p) {
    float t0 = 1.0 - u_morph;
    float t1 = p.y * u_params.x;
    float t2 = cos(t1);
    float t3 = sin(t1);
    float t4 = u_params.x * t3;
    float t5 = u_params.x * t2;
    float t6 = p.z * t5 - p.x * t4;
    float t7 = -(p.z * t4) - p.x * t5;
    float t8 = t0 + u_morph * (t2 * t2 + t3 * t3);
    float t9 = u_morph * (t2 * t6 - t3 * t7);
    float t10 = u_morph * (t3 * t6 + t2 * t7);
    return mat3(t8, t9, 0.0, t9, t0 + u_morph * (t7 * t7 + (1.0 + t6 * t6)), t10, 0.0, t10, t8);
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = p.y * u_params.x;
    float t1 = cos(t0);
    float t2 = sin(t0);
    float t3 = u_params.x * t2;
    float t4 = u_params.x * t1;
    float t5 = p.z * t4 - p.x * t3;
    float t6 = -(p.z * t3) - p.x * t4;
    float t7 = t1 * t3;
    float t8 = t2 * t4;
    float t9 = u_morph * (t8 - t7);
    float t10 = t3 * t5;
    float t11 = t4 * t6;
    float t12 = t2 * t3;
    float t13 = t1 * t4;
    float t14 = u_morph * (-t12 - t13);
    float t15 = u_morph * (2.0 * t8 - 2.0 * t7);
    float t16 = u_params.x * t4;
    float t17 = u_params.x * t3;
    float t18 = -(p.z * t17) - p.x * t16;
    float t19 = p.x * t17 - p.z * t16;
    float t20 = u_morph * (t1 * t18 - t10 - (t11 + t2 * t19));
    float t21 = t4 * t5;
    float t22 = t3 * t6;
    float t23 = u_morph * (t21 + t2 * t18 + (t1 * t19 - t22));
    float t24 = u_morph * (t12 + t13);
    dgdx = mat3(0.0, t9, 0.0, t9, u_morph * (-(2.0 * t10) - 2.0 * t11), t14, 0.0, t14, 0.0);
    dgdy = mat3(t15, t20, 0.0, t20, u_morph * (2.0 * (t5 * t18) + 2.0 * (t6 * t19)), t23, 0.0, t23, t15);
    dgdz = mat3(0.0, t24, 0.0, t24, u_morph * (2.0 * t21 - 2.0 * t22), t9, 0.0, t9, 0.0);
}
