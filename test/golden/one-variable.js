function f({ x }) {
  const t0 = x * x;
  return { value: -(2 * x - x * t0 - Math.atan2(1, x)), gradient: [3 * t0 - 2 - 1 / (1 + t0)] };
}
