fn metricTensor(p: vec3<f32>) -> mat3x3<f32> {
    let t0 = 1.0 + 0.5 * (u_params.x / sqrt(p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y));
    let t1 = t0 * t0;
    let t2 = -(u_morph - 1.0 - u_morph * (t1 * t1));
    return mat3x3<f32>(t2, 0.0, 0.0, 0.0, t2, 0.0, 0.0, 0.0, t2);
}

fn metricPartials(p: vec3<f32>, dgdx: ptr<function, mat3x3<f32>>, dgdy: ptr<function, mat3x3<f32>>, dgdz: ptr<function, mat3x3<f32>>) {
    let t0 = p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y;
    let t1 = sqrt(t0);
    let t2 = 1.0 + 0.5 * (u_params.x / t1);
    let t3 = t0 * t1;
    let t4 = u_params.x * (u_morph * (t2 * (t2 * t2)));
    let t5 = -2.0 * (p.x * t4 / t3);
    let t6 = -2.0 * (p.y * t4 / t3);
    let t7 = -2.0 * (p.z * t4 / t3);
    *dgdx = mat3x3<f32>(t5, 0.0, 0.0, 0.0, t5, 0.0, 0.0, 0.0, t5);
    *dgdy = mat3x3<f32>(t6, 0.0, 0.0, 0.0, t6, 0.0, 0.0, 0.0, t6);
    *dgdz = mat3x3<f32>(t7, 0.0, 0.0, 0.0, t7, 0.0, 0.0, 0.0, t7);
}
