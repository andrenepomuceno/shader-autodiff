mat3 metricTensor(vec3 p) {
    float t0 = 1.0 - u_morph;
    float t1 = p.z * u_params.w - u_params.y * u_time;
    float t2 = p.z * u_params.x + u_params.z * sin(t1);
    float t3 = cos(t2);
    float t4 = sin(t2);
    float t5 = u_params.x + u_params.z * (u_params.w * cos(t1));
    float t6 = t4 * t5;
    float t7 = t3 * t5;
    float t8 = -(p.x * t6) - p.y * t7;
    float t9 = p.x * t7 - p.y * t6;
    float t10 = t0 + u_morph * (t3 * t3 + t4 * t4);
    float t11 = u_morph * (t3 * t8 + t4 * t9);
    float t12 = u_morph * (t3 * t9 - t4 * t8);
    return mat3(t10, 0.0, t11, 0.0, t10, t12, t11, t12, t0 + u_morph * (1.0 + (t8 * t8 + t9 * t9)));
}

void metricPartials(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz) {
    float t0 = p.z * u_params.w - u_params.y * u_time;
    float t1 = sin(t0);
    float t2 = p.z * u_params.x + u_params.z * t1;
    float t3 = cos(t2);
    float t4 = sin(t2);
    float t5 = u_params.x + u_params.z * (u_params.w * cos(t0));
    float t6 = t4 * t5;
    float t7 = t3 * t5;
    float t8 = -(p.x * t6) - p.y * t7;
    float t9 = p.x * t7 - p.y * t6;
    float t10 = t3 * t6;
    float t11 = t4 * t7;
    float t12 = u_morph * (t11 - t10);
    float t13 = t4 * t6;
    float t14 = t3 * t7;
    float t15 = u_morph * (t13 + t14);
    float t16 = t6 * t8;
    float t17 = t7 * t9;
    float t18 = u_morph * (-t13 - t14);
    float t19 = t7 * t8;
    float t20 = t6 * t9;
    float t21 = u_morph * (2.0 * t11 - 2.0 * t10);
    float t22 = u_params.z * (u_params.w * (u_params.w * t1));
    float t23 = t5 * t7 - t4 * t22;
    float t24 = -(t5 * t6) - t3 * t22;
    float t25 = -(p.x * t23) - p.y * t24;
    float t26 = p.x * t24 - p.y * t23;
    float t27 = u_morph * (t3 * t25 - t16 + (t17 + t4 * t26));
    float t28 = u_morph * (t3 * t26 - t20 - (t19 + t4 * t25));
    dgdx = mat3(0.0, 0.0, t12, 0.0, 0.0, t15, t12, t15, u_morph * (2.0 * t17 - 2.0 * t16));
    dgdy = mat3(0.0, 0.0, t18, 0.0, 0.0, t12, t18, t12, u_morph * (-(2.0 * t19) - 2.0 * t20));
    dgdz = mat3(t21, 0.0, t27, 0.0, t21, t28, t27, t28, u_morph * (2.0 * (t8 * t25) + 2.0 * (t9 * t26)));
}
