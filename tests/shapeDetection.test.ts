import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  distance,
  pointToSegmentDistance,
  pathLength,
  detectShape
} from '../src/utils/shapeDetection.ts';
import type { Point } from '../src/utils/shapeDetection.ts';

describe('Shape Detection & Snapping Engine', () => {
  it('calculates Euclidean distance correctly', () => {
    assert.strictEqual(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.strictEqual(distance({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
  });

  it('calculates point to segment distance', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 10, y: 0 };
    // Point directly on segment
    assert.strictEqual(pointToSegmentDistance({ x: 5, y: 0 }, a, b), 0);
    // Point 5 units above midpoint
    assert.strictEqual(pointToSegmentDistance({ x: 5, y: 5 }, a, b), 5);
  });

  it('detects straight lines with high confidence', () => {
    // A straight horizontal stroke with minor jitter
    const points: Point[] = [
      { x: 10, y: 50 },
      { x: 30, y: 51 },
      { x: 50, y: 49 },
      { x: 70, y: 50 },
      { x: 90, y: 52 },
      { x: 120, y: 50 }
    ];

    const result = detectShape(points);
    assert.strictEqual(result.type, 'line');
    assert.ok(result.confidence > 0.8);
    assert.strictEqual(result.points.length, 2);
    assert.deepStrictEqual(result.points[0], { x: 10, y: 50 });
    assert.deepStrictEqual(result.points[1], { x: 120, y: 50 });
  });

  it('detects circles/ellipses with radial uniformity', () => {
    // Sample points along a circle of radius 50 centered at (100, 100)
    const points: Point[] = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      // Add slight noise (±2px)
      const noise = (i % 2 === 0 ? 1 : -1) * 1.5;
      points.push({
        x: 100 + Math.cos(angle) * (50 + noise),
        y: 100 + Math.sin(angle) * (50 + noise)
      });
    }

    const result = detectShape(points);
    assert.strictEqual(result.type, 'circle');
    assert.ok(result.confidence > 0.7);
    assert.ok(result.points.length > 20);
  });

  it('detects rectangles from box-like strokes', () => {
    // Stroke outlining a 100x80 box
    const points: Point[] = [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 90 },
      { x: 150, y: 130 },
      { x: 100, y: 130 },
      { x: 50, y: 130 },
      { x: 50, y: 90 },
      { x: 50, y: 50 }
    ];

    const result = detectShape(points);
    assert.strictEqual(result.type, 'rectangle');
    assert.ok(result.confidence > 0.7);
  });

  it('detects diamonds from diamond-like strokes', () => {
    // Diamond with vertices at (100, 50), (150, 100), (100, 150), (50, 100)
    const points: Point[] = [
      { x: 100, y: 50 },
      { x: 125, y: 75 },
      { x: 150, y: 100 },
      { x: 125, y: 125 },
      { x: 100, y: 150 },
      { x: 75, y: 125 },
      { x: 50, y: 100 },
      { x: 75, y: 75 },
      { x: 100, y: 50 }
    ];

    const result = detectShape(points);
    assert.strictEqual(result.type, 'diamond');
    assert.ok(result.confidence > 0.7);
  });

  it('detects triangles from triangular strokes', () => {
    // Triangle with top (100, 50), right (160, 150), left (40, 150)
    const points: Point[] = [
      { x: 100, y: 50 },
      { x: 130, y: 100 },
      { x: 160, y: 150 },
      { x: 100, y: 150 },
      { x: 40, y: 150 },
      { x: 70, y: 100 },
      { x: 100, y: 50 }
    ];

    const result = detectShape(points);
    assert.strictEqual(result.type, 'triangle');
    assert.ok(result.confidence > 0.7);
  });

  it('returns none for irregular doodles', () => {
    const points: Point[] = [
      { x: 10, y: 20 },
      { x: 50, y: 80 },
      { x: 20, y: 140 },
      { x: 90, y: 10 },
      { x: 120, y: 200 }
    ];

    const result = detectShape(points);
    assert.strictEqual(result.type, 'none');
  });
});
