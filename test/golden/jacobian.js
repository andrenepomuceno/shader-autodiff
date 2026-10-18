function f({ x, y, a }) {
  const t0 = Math.cos(y);
  const t1 = x * t0;
  const t2 = Math.sin(y);
  const t3 = x * t2;
  return { value: [t1, t3, x * a], jacobian: [[t0, -t3], [t2, t1], [a, 0]] };
}
