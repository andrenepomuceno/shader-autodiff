fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    let t1 = 2.0 * sqrt(t0 * t0 + u_params.y * u_params.y);
    let t2 = u_params.x / t1;
    let t3 = 1.0 + t2;
    let t4 = t3 * t3;
    let t5 = 2.0 * t0;
    *gradient = vec3<f32>(-(2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.x / t5)) / t1)) / t1))))), -(2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.y / t5)) / t1)) / t1))))), -(2.0 * (t4 * (2.0 * (t3 * (t2 * (2.0 * (2.0 * (t0 * (2.0 * p.z / t5)) / t1)) / t1))))));
    return t4 * t4;
}
