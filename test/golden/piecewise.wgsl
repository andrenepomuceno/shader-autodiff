fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 {
    let t0 = min(p.x, p.y);
    let t1 = max(p.y, p.z);
    let t2 = sign(p.y);
    *gradient = vec3<f32>(sign(p.x) + (1.0 + t1 * select(0.0, 1.0, p.x < p.y)), t1 * select(1.0, 0.0, p.x < p.y) + t0 * select(1.0, 0.0, p.y < p.z), t2 + t0 * select(0.0, 1.0, p.y < p.z));
    return floor(p.z) + (t0 * t1 + (p.x + abs(p.x))) + p.z * t2 - 2.0 * floor(0.5 * p.x);
}
