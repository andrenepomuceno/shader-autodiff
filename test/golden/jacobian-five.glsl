void f(float u, float v, float w, float s, float q, out vec2 value, out float jacobian[10]) {
    value = vec2(u * v, w + s * q);
    jacobian[0] = v;
    jacobian[1] = 0.0;
    jacobian[2] = u;
    jacobian[3] = 0.0;
    jacobian[4] = 0.0;
    jacobian[5] = 1.0;
    jacobian[6] = 0.0;
    jacobian[7] = q;
    jacobian[8] = 0.0;
    jacobian[9] = s;
}
