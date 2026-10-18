fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    let t1 = 1.0 + u_params.x / (2.0 * sqrt(t0 * t0 + u_params.y * u_params.y));
    let t2 = t1 * t1;
    let t3 = 1.0 - u_morph + u_morph * (t2 * t2);
    return mat3x3<f32>(t3, 0.0, 0.0, 0.0, t3, 0.0, 0.0, 0.0, t3);
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    let t1 = 2.0 * sqrt(t0 * t0 + u_params.y * u_params.y);
    let t2 = u_params.x / t1;
    let t3 = 1.0 + t2;
    let t4 = t3 * t3;
    let t5 = 2.0 * t0;
    let t6 = -32.0 * (u_morph * (t4 * (t3 * (t2 * (t0 * (p.x / t5) / t1) / t1))));
    let t7 = -32.0 * (u_morph * (t4 * (t3 * (t2 * (t0 * (p.y / t5) / t1) / t1))));
    let t8 = -32.0 * (u_morph * (t4 * (t3 * (t2 * (t0 * (p.z / t5) / t1) / t1))));
    *dgdx = mat3x3<f32>(t6, 0.0, 0.0, 0.0, t6, 0.0, 0.0, 0.0, t6);
    *dgdy = mat3x3<f32>(t7, 0.0, 0.0, 0.0, t7, 0.0, 0.0, 0.0, t7);
    *dgdz = mat3x3<f32>(t8, 0.0, 0.0, 0.0, t8, 0.0, 0.0, 0.0, t8);
}
