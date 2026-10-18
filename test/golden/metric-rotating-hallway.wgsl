fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = p.z * u_params.w - u_params.y * u_time;
    let t1 = p.z * u_params.x + u_params.z * sin(t0);
    let t2 = cos(t1);
    let t3 = sin(t1);
    let t4 = p.x * t2 - p.y * t3;
    let t5 = p.x * t3 + p.y * t2;
    let t6 = u_params.x + u_params.z * (u_params.w * cos(t0));
    let t7 = t6 * t6;
    let t8 = -(u_morph * (t6 * (t2 * t5 - t3 * t4)));
    let t9 = u_morph * (t6 * (t2 * t4 + t3 * t5));
    return mat3x3<f32>(1.0, 0.0, t8, 0.0, 1.0, t9, t8, t9, -(u_morph - 1.0 - u_morph * (t7 * (t5 * t5) + (1.0 + t7 * (t4 * t4)))));
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = p.z * u_params.w - u_params.y * u_time;
    let t1 = sin(t0);
    let t2 = p.z * u_params.x + u_params.z * t1;
    let t3 = cos(t2);
    let t4 = sin(t2);
    let t5 = p.x * t3 - p.y * t4;
    let t6 = p.x * t4 + p.y * t3;
    let t7 = u_params.x + u_params.z * (u_params.w * cos(t0));
    let t8 = t3 * t6 - t4 * t5;
    let t9 = t3 * t5 + t4 * t6;
    let t10 = t7 * t7;
    let t11 = u_morph * t7;
    let t12 = -t11;
    let t13 = u_params.w * u_params.w;
    let t14 = u_params.z * (t13 * (u_morph * (t1 * t8)));
    let t15 = -(u_params.z * (t13 * (u_morph * (t1 * t9))));
    *dgdx = mat3x3<f32>(0.0, 0.0, 0.0, 0.0, 0.0, t11, 0.0, t11, 2.0 * (u_morph * (t9 * t10)));
    *dgdy = mat3x3<f32>(0.0, 0.0, t12, 0.0, 0.0, 0.0, t12, 0.0, 2.0 * (u_morph * (t8 * t10)));
    *dgdz = mat3x3<f32>(0.0, 0.0, t14, 0.0, 0.0, t15, t14, t15, -2.0 * (u_params.z * (t13 * (u_morph * (t1 * (t7 * (t6 * t6 + t5 * t5)))))));
}
