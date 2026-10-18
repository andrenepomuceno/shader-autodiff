fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = 1.0 - u_morph;
    let t1 = p.z * u_params.w - u_params.y * u_time;
    let t2 = p.z * u_params.x + u_params.z * sin(t1);
    let t3 = cos(t2);
    let t4 = sin(t2);
    let t5 = u_params.x + u_params.z * (u_params.w * cos(t1));
    let t6 = t4 * t5;
    let t7 = t3 * t5;
    let t8 = -(p.x * t6) - p.y * t7;
    let t9 = p.x * t7 - p.y * t6;
    let t10 = t0 + u_morph * (t3 * t3 + t4 * t4);
    let t11 = u_morph * (t3 * t8 + t4 * t9);
    let t12 = u_morph * (t3 * t9 - t4 * t8);
    return mat3x3<f32>(t10, 0.0, t11, 0.0, t10, t12, t11, t12, t0 + u_morph * (1.0 + (t8 * t8 + t9 * t9)));
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = p.z * u_params.w - u_params.y * u_time;
    let t1 = sin(t0);
    let t2 = p.z * u_params.x + u_params.z * t1;
    let t3 = cos(t2);
    let t4 = sin(t2);
    let t5 = u_params.x + u_params.z * (u_params.w * cos(t0));
    let t6 = t4 * t5;
    let t7 = t3 * t5;
    let t8 = -(p.x * t6) - p.y * t7;
    let t9 = p.x * t7 - p.y * t6;
    let t10 = t3 * t6;
    let t11 = t4 * t7;
    let t12 = u_morph * (t11 - t10);
    let t13 = t4 * t6;
    let t14 = t3 * t7;
    let t15 = u_morph * (t13 + t14);
    let t16 = t6 * t8;
    let t17 = t7 * t9;
    let t18 = u_morph * (-t13 - t14);
    let t19 = t7 * t8;
    let t20 = t6 * t9;
    let t21 = u_morph * (2.0 * t11 - 2.0 * t10);
    let t22 = u_params.z * (u_params.w * (u_params.w * t1));
    let t23 = t5 * t7 - t4 * t22;
    let t24 = -(t5 * t6) - t3 * t22;
    let t25 = -(p.x * t23) - p.y * t24;
    let t26 = p.x * t24 - p.y * t23;
    let t27 = u_morph * (t3 * t25 - t16 + (t17 + t4 * t26));
    let t28 = u_morph * (t3 * t26 - t20 - (t19 + t4 * t25));
    *dgdx = mat3x3<f32>(0.0, 0.0, t12, 0.0, 0.0, t15, t12, t15, u_morph * (2.0 * t17 - 2.0 * t16));
    *dgdy = mat3x3<f32>(0.0, 0.0, t18, 0.0, 0.0, t12, t18, t12, u_morph * (-2.0 * t19 - 2.0 * t20));
    *dgdz = mat3x3<f32>(t21, 0.0, t27, 0.0, t21, t28, t27, t28, u_morph * (2.0 * (t8 * t25) + 2.0 * (t9 * t26)));
}
