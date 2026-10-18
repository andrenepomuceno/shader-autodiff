fn f(x: f32, gradient: ptr<function, f32>) -> f32 {
    let t0 = x * x;
    *gradient = 3.0 * t0 - 2.0 - 1.0 / (1.0 + t0);
    return -(2.0 * x - x * t0 - atan2(1.0, x));
}
