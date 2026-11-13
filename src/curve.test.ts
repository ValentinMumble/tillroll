import {describe, expect, it} from 'vitest';
import {monotonePath} from './curve';

/** Each curve of the path: where it starts, its two handles and where it ends. */
function segments(path: string) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const result = [];
  for (let index = 2; index + 6 <= numbers.length; index += 6) {
    const [handleX, handleY, otherX, otherY, toX, toY] = numbers.slice(index, index + 6);
    result.push({fromX: numbers[index - 2], fromY: numbers[index - 1], handleX, handleY, otherX, otherY, toX, toY});
  }
  return result;
}

describe('monotonePath', () => {
  // An account's values typed on uneven days: a week apart, then on three days in a row, then a gap.
  const points = [
    {x: 0, y: 60},
    {x: 25, y: 62},
    {x: 29, y: 55},
    {x: 33, y: 50},
    {x: 50, y: 54},
    {x: 58, y: 30},
    {x: 77, y: 25},
    {x: 81, y: 26},
    {x: 100, y: 5},
  ];

  it('goes through every point', () => {
    const curves = segments(monotonePath(points));
    expect(curves).toHaveLength(points.length - 1);
    curves.forEach((curve, index) => {
      expect(curve.fromX).toBeCloseTo(points[index].x);
      expect(curve.toY).toBeCloseTo(points[index + 1].y);
    });
  });

  it('never folds back nor swings past its two neighbours, even where points sit close', () => {
    for (const curve of segments(monotonePath(points))) {
      for (const x of [curve.handleX, curve.otherX]) {
        expect(x).toBeGreaterThanOrEqual(curve.fromX);
        expect(x).toBeLessThanOrEqual(curve.toX);
      }
      for (const y of [curve.handleY, curve.otherY]) {
        expect(y).toBeGreaterThanOrEqual(Math.min(curve.fromY, curve.toY) - 0.01);
        expect(y).toBeLessThanOrEqual(Math.max(curve.fromY, curve.toY) + 0.01);
      }
    }
  });

  it('draws two points as a straight line', () => {
    expect(monotonePath([points[0], points[1]])).toBe('M 0.00 60.00 L 25.00 62.00');
  });
});
