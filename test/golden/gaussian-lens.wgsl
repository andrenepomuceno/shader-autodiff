fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    let t1 = u_params.y * u_params.y;
    let t2 = exp(-(t0 * t0 / t1));
    let t3 = 2.0 * t0;
    *gradient = vec3<f32>(-4.0 * (u_params.x * (t2 * (t0 * (p.x / t3) / t1))), -4.0 * (u_params.x * (t2 * (t0 * (p.y / t3) / t1))), -4.0 * (u_params.x * (t2 * (t0 * (p.z / t3) / t1))));
    return 1.0 + u_params.x * t2;
}
