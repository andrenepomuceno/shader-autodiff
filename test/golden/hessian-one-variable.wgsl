fn f(x: f32, gradient: ptr<function, f32>, hessian: ptr<function, f32>) -> f32 {
    let t0 = exp(x);
    *gradient = t0 * (1.0 + x);
    *hessian = t0 * (2.0 + x);
    return x * t0;
}
