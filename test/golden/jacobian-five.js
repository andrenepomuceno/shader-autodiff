function f({ u, v, w, s, q }) {
  return { value: [u * v, w + s * q], jacobian: [[v, u, 0, 0, 0], [0, 0, 1, q, s]] };
}
