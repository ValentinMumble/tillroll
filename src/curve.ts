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

/**
 * An SVG path curving through points whose x grows, unevenly spaced (values typed on any day): a monotone cubic, as
 * d3's curveMonotoneX. It never swings above or below its two neighbours, nor folds back where points sit close.
 */
export function monotonePath(points: {x: number; y: number}[]) {
  const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  if (points.length < 3) return points.map((point, index) => `${index ? 'L' : 'M'} ${at(point.x, point.y)}`).join(' ');
  const slopes = points.slice(1).map((point, index) => {
    const width = point.x - points[index].x;
    return width ? (point.y - points[index].y) / width : 0;
  });
  // Flat at a peak or a dip, else the gentlest of the two slopes around it (Fritsch-Carlson).
  const tangents = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return 0;
    const [before, after] = [slopes[index - 1], slopes[index]];
    if (before * after <= 0) return 0;
    const left = point.x - points[index - 1].x;
    const right = points[index + 1].x - point.x;
    const mean = (before * right + after * left) / (left + right);
    return 2 * Math.sign(before) * Math.min(Math.abs(before), Math.abs(after), Math.abs(mean) / 2);
  });
  const last = points.length - 1;
  tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
  tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2;
  let path = `M ${at(points[0].x, points[0].y)}`;
  for (let index = 0; index < last; index += 1) {
    const [from, to] = [points[index], points[index + 1]];
    const third = (to.x - from.x) / 3;
    path += ` C ${at(from.x + third, from.y + third * tangents[index])}, ${at(
      to.x - third,
      to.y - third * tangents[index + 1],
    )}, ${at(to.x, to.y)}`;
  }
  return path;
}
