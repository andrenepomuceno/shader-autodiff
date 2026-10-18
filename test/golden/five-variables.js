function f({ u, v, w, s, q }) {
  const t0 = Math.sinh(s);
  return { value: u * v + w * t0 - q * q, gradient: [v, u, t0, w * Math.cosh(s), -(2 * q)] };
}
