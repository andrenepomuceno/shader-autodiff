fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = u_params.y * u_params.y;
    let t1 = u_params.x * exp(-((p.x * p.x + p.y * p.y + p.z * p.z) / t0));
    *gradient = vec3<f32>(-2.0 * (p.x * t1 / t0), -2.0 * (p.y * t1 / t0), -2.0 * (p.z * t1 / t0));
    return 1.0 + t1;
}
