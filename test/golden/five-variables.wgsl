fn f(u: f32, v: f32, w: f32, s: f32, q: f32, gradient: ptr<function, array<f32, 5>>) -> f32 {
    let t0 = sinh(s);
    (*gradient)[0] = v;
    (*gradient)[1] = u;
    (*gradient)[2] = t0;
    (*gradient)[3] = w * cosh(s);
    (*gradient)[4] = -(2.0 * q);
    return u * v + w * t0 - q * q;
}
