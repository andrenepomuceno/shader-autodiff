function f({ x, y, z, a, b, c, d, t }) {
  const t0 = b * b;
  const t1 = a * Math.exp(-((x * x + y * y + z * z) / t0));
  return { value: 1 + t1, gradient: [-2 * (x * t1 / t0), -2 * (y * t1 / t0), -2 * (z * t1 / t0)] };
}
