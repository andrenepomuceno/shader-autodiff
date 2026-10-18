fn f(p: vec2<f32>, gradient: ptr<function, vec2<f32>>, hessian: ptr<function, mat2x2<f32>>) -> f32 {
    let t0 = p.x * p.x;
    let t1 = sin(p.y);
    let t2 = 2.0 * p.x;
    *gradient = vec2<f32>(2.0 * (p.x * p.y), t0 + cos(p.y));
    *hessian = mat2x2<f32>(2.0 * p.y, t2, t2, -t1);
    return p.y * t0 + t1;
}
