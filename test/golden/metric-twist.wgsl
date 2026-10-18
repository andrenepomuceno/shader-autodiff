fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = p.y * u_params.x;
    let t1 = cos(t0);
    let t2 = sin(t0);
    let t3 = p.x * t1 + p.z * t2;
    let t4 = p.x * t2 - p.z * t1;
    let t5 = u_params.x * u_params.x;
    let t6 = -(u_params.x * (u_morph * (t1 * t4 - t2 * t3)));
    let t7 = -(u_params.x * (u_morph * (t2 * t4 + t1 * t3)));
    return mat3x3<f32>(1.0, t6, 0.0, t6, -(u_morph - 1.0 - u_morph * (t4 * t4 * t5 + (1.0 + t5 * (t3 * t3)))), t7, 0.0, t7, 1.0);
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = p.y * u_params.x;
    let t1 = cos(t0);
    let t2 = sin(t0);
    let t3 = p.x * t1 + p.z * t2;
    let t4 = p.x * t2 - p.z * t1;
    let t5 = u_params.x * u_params.x;
    let t6 = u_params.x * u_morph;
    let t7 = -t6;
    *dgdx = mat3x3<f32>(0.0, 0.0, 0.0, 0.0, 2.0 * (t5 * (u_morph * (t2 * t4 + t1 * t3))), t7, 0.0, t7, 0.0);
    *dgdy = mat3x3<f32>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    *dgdz = mat3x3<f32>(0.0, t6, 0.0, t6, -2.0 * (t5 * (u_morph * (t1 * t4 - t2 * t3))), 0.0, 0.0, 0.0, 0.0);
}
