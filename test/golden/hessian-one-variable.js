function f({ x }) {
  const t0 = Math.exp(x);
  return { value: x * t0, gradient: [t0 * (1 + x)], hessian: [[t0 * (2 + x)]] };
}
