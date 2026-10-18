function f({ x, y }) {
  const t0 = x * x;
  const t1 = Math.sin(y);
  const t2 = 2 * x;
  return { value: y * t0 + t1, gradient: [y * t2, t0 + Math.cos(y)], hessian: [[2 * y, t2], [t2, -t1]] };
}
