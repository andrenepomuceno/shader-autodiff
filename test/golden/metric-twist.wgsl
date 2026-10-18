fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = 1.0 - u_morph;
    let t1 = p.y * u_params.x;
    let t2 = cos(t1);
    let t3 = sin(t1);
    let t4 = u_params.x * t3;
    let t5 = u_params.x * t2;
    let t6 = p.z * t5 - p.x * t4;
    let t7 = -(p.z * t4) - p.x * t5;
    let t8 = t0 + u_morph * (t2 * t2 + t3 * t3);
    let t9 = u_morph * (t2 * t6 - t3 * t7);
    let t10 = u_morph * (t3 * t6 + t2 * t7);
    return mat3x3<f32>(t8, t9, 0.0, t9, t0 + u_morph * (t7 * t7 + (1.0 + t6 * t6)), t10, 0.0, t10, t8);
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = p.y * u_params.x;
    let t1 = cos(t0);
    let t2 = sin(t0);
    let t3 = u_params.x * t2;
    let t4 = u_params.x * t1;
    let t5 = p.z * t4 - p.x * t3;
    let t6 = -(p.z * t3) - p.x * t4;
    let t7 = t1 * t3;
    let t8 = t2 * t4;
    let t9 = u_morph * (t8 - t7);
    let t10 = t3 * t5;
    let t11 = t4 * t6;
    let t12 = t2 * t3;
    let t13 = t1 * t4;
    let t14 = u_morph * (-t12 - t13);
    let t15 = u_morph * (2.0 * t8 - 2.0 * t7);
    let t16 = u_params.x * t4;
    let t17 = u_params.x * t3;
    let t18 = -(p.z * t17) - p.x * t16;
    let t19 = p.x * t17 - p.z * t16;
    let t20 = u_morph * (t1 * t18 - t10 - (t11 + t2 * t19));
    let t21 = t4 * t5;
    let t22 = t3 * t6;
    let t23 = u_morph * (t21 + t2 * t18 + (t1 * t19 - t22));
    let t24 = u_morph * (t12 + t13);
    *dgdx = mat3x3<f32>(0.0, t9, 0.0, t9, u_morph * (-2.0 * t10 - 2.0 * t11), t14, 0.0, t14, 0.0);
    *dgdy = mat3x3<f32>(t15, t20, 0.0, t20, u_morph * (2.0 * (t5 * t18) + 2.0 * (t6 * t19)), t23, 0.0, t23, t15);
    *dgdz = mat3x3<f32>(0.0, t24, 0.0, t24, u_morph * (2.0 * t21 - 2.0 * t22), t9, 0.0, t9, 0.0);
}
