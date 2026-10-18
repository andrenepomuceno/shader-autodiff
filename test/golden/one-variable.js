function f({ x }) {
  const t0 = x * x;
  const t1 = 2 * x;
  return { value: x * t0 - t1 + Math.atan2(1, x), gradient: [t0 + x * t1 - 2 - 1 / (1 + t0)] };
}
