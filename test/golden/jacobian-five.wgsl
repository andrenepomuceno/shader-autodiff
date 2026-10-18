fn f(u: f32, v: f32, w: f32, s: f32, q: f32, value: ptr<function, vec2<f32>>, jacobian: ptr<function, array<f32, 10>>) {
    *value = vec2<f32>(u * v, w + s * q);
    (*jacobian)[0] = v;
    (*jacobian)[1] = 0.0;
    (*jacobian)[2] = u;
    (*jacobian)[3] = 0.0;
    (*jacobian)[4] = 0.0;
    (*jacobian)[5] = 1.0;
    (*jacobian)[6] = 0.0;
    (*jacobian)[7] = q;
    (*jacobian)[8] = 0.0;
    (*jacobian)[9] = s;
}
