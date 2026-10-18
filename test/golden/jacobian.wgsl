fn f(p: vec2<f32>, value: ptr<function, vec3<f32>>, jacobian: ptr<function, mat2x3<f32>>) {
    let t0 = cos(p.y);
    let t1 = p.x * t0;
    let t2 = sin(p.y);
    let t3 = p.x * t2;
    *value = vec3<f32>(t1, t3, p.x * u_params.x);
    *jacobian = mat2x3<f32>(t0, t2, u_params.x, -t3, t1, 0.0);
}
