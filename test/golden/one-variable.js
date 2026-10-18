function f({ x }) {
  const t0 = x * x;
  return { value: x * t0 - 2 * x + Math.atan2(1, x), gradient: [t0 + 2 * t0 - 2 - 1 / (1 + t0)] };
}
