function f({ x }) {
  const t0 = Math.exp(x);
  const t1 = x * t0;
  const t2 = t0 + t1;
  return { value: t1, gradient: [t2], hessian: [[t0 + t2]] };
}
