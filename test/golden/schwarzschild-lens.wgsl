fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = p.x * p.x + p.y * p.y + p.z * p.z + u_params.y * u_params.y;
    let t1 = sqrt(t0);
    let t2 = 1.0 + 0.5 * (u_params.x / t1);
    let t3 = t2 * t2;
    let t4 = t0 * t1;
    let t5 = u_params.x * (t2 * t3);
    *gradient = vec3<f32>(-2.0 * (p.x * t5 / t4), -2.0 * (p.y * t5 / t4), -2.0 * (p.z * t5 / t4));
    return t3 * t3;
}
