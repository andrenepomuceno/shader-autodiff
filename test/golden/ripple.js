function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.sqrt(x * x + y * y + z * z);
  const t1 = b * t0 - c * t;
  const t2 = Math.sin(t1);
  const t3 = 1 + t0;
  const t4 = t0 * t3;
  const t5 = a * (t2 / t3 - b * Math.cos(t1));
  return { value: 1 + a * t2 / t3, gradient: [-(x * t5 / t4), -(y * t5 / t4), -(z * t5 / t4)] };
}
