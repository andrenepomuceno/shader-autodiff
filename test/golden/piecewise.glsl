float f(vec3 p, out vec3 grad) {
    float t0 = min(p.x, p.y);
    float t1 = max(p.y, p.z);
    float t2 = sign(p.y);
    grad = vec3(1.0 + (sign(p.x) + t1 * (p.x < p.y ? 1.0 : 0.0)), t1 * (p.x < p.y ? 0.0 : 1.0) + t0 * (p.y < p.z ? 0.0 : 1.0), t2 + t0 * (p.y < p.z ? 1.0 : 0.0));
    return abs(p.x) + t0 * t1 + floor(p.z) + (p.x - 2.0 * floor(p.x / 2.0)) + p.z * t2;
}
