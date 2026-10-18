float f(vec3 p, out vec3 gradient) {
    float t0 = min(p.x, p.y);
    float t1 = max(p.y, p.z);
    float t2 = sign(p.y);
    gradient = vec3(sign(p.x) + (1.0 + t1 * (p.x < p.y ? 1.0 : 0.0)), t1 * (p.x < p.y ? 0.0 : 1.0) + t0 * (p.y < p.z ? 0.0 : 1.0), t2 + t0 * (p.y < p.z ? 1.0 : 0.0));
    return floor(p.z) + (t0 * t1 + (abs(p.x) + (p.x + p.z * t2))) - 2.0 * floor(0.5 * p.x);
}
