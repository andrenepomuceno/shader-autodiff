fn f(x: f32, gradient: ptr<function, f32>) -> f32 {
    let t0 = x * x;
    let t1 = 2.0 * x;
    *gradient = t0 + x * t1 - 2.0 - 1.0 / (1.0 + t0);
    return x * t0 - t1 + atan2(1.0, x);
}
