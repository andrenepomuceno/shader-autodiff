fn f(x: f32, gradient: ptr<function, f32>, hessian: ptr<function, f32>) -> f32 {
    let t0 = exp(x);
    let t1 = x * t0;
    let t2 = t0 + t1;
    *gradient = t2;
    *hessian = t0 + t2;
    return t1;
}
