/** An SVG path curving smoothly through the points, from one to the next (a Catmull-Rom curve). */
export function smoothPath(points: {x: number; y: number}[]) {
  const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  let path = `M ${at(points[0].x, points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index];
    const from = points[index];
    const to = points[index + 1];
    const after = points[index + 2] ?? to;
    path += ` C ${at(from.x + (to.x - before.x) / 6, from.y + (to.y - before.y) / 6)}, ${at(
      to.x - (after.x - from.x) / 6,
      to.y - (after.y - from.y) / 6,
    )}, ${at(to.x, to.y)}`;
  }
  return path;
}
