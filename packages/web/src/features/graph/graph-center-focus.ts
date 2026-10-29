// A fixed, viewport-centered focus lens. Only the G6 presentation layer uses
// these values; node identity, positions and stored Knowledge remain untouched.
const NODE_DIAMETER = 32;
const NODE_LABEL_SIZE = 12;

export function priorityRadius(rank: number): number {
  // Large search results occupy a navigable graph, never a single crammed screen.
  return 80 + 52 * Math.sqrt(Math.max(0, rank));
}

export function centerFocusScale(x: number, y: number, width: number, height: number): number {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return 1;
  const radius = Math.max(140, Math.min(width, height) * 0.48);
  const distance = Math.hypot(x - width / 2, y - height / 2);
  const closeness = Math.max(0, 1 - distance / radius);
  // Smoothstep prevents a visible hard edge to the permanent lens.
  const smooth = closeness * closeness * (3 - 2 * closeness);
  // Slightly stronger center emphasis (1.8x instead of 1.5x), while the
  // periphery and the smooth transition remain unchanged.
  return 0.82 + 0.98 * smooth;
}

export function centerFocusStyle(scale: number) {
  return {
    size: NODE_DIAMETER * scale,
    labelFontSize: NODE_LABEL_SIZE * scale,
    labelOffsetY: 10 * scale
  };
}
