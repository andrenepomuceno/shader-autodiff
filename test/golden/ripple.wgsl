fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    let t1 = u_params.y * t0 - u_params.z * u_time;
    let t2 = sin(t1);
    let t3 = 1.0 + t0;
    let t4 = t0 * t3;
    let t5 = u_params.x * (t2 / t3 - u_params.y * cos(t1));
    *gradient = vec3<f32>(-(p.x * t5 / t4), -(p.y * t5 / t4), -(p.z * t5 / t4));
    return 1.0 + u_params.x * t2 / t3;
}
