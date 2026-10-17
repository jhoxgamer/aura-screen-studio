/**
 * Shape Detection & Snapping Engine
 * Inspired by Zoom's CAnnoToolShapeDetector & CAnnoToolAutoShape (annoter.dll)
 * Automatically detects freehand sketches and snaps them to perfect vector geometries.
 */

export interface Point {
  x: number;
  y: number;
}

export type DetectedShapeType =
  | 'circle'
  | 'rectangle'
  | 'triangle'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'none';

export interface ShapeDetectionResult {
  type: DetectedShapeType;
  confidence: number;
  points: Point[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

/**
 * Calculates Euclidean distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates perpendicular distance from a point to a line segment (a -> b).
 */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

/**
 * Calculates total path length.
 */
export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
}

/**
 * Computes bounding box and center of points.
 */
export function getBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return { minX, minY, maxX, maxY, width, height, centerX, centerY };
}

/**
 * Main Shape Detection Algorithm
 * Analyzes stroke curvature, closure, radial variance, and vertex distribution.
 */
export function detectShape(points: Point[]): ShapeDetectionResult {
  const bounds = getBounds(points);

  if (points.length < 5) {
    return { type: 'none', confidence: 0, points, bounds };
  }

  const totalLen = pathLength(points);
  if (totalLen < 20) {
    return { type: 'none', confidence: 0, points, bounds };
  }

  const startPt = points[0];
  const endPt = points[points.length - 1];
  const startEndDist = distance(startPt, endPt);
  const isClosed = startEndDist < Math.max(35, totalLen * 0.28);

  // 1. Check for Straight Line (open stroke with low deviation from chord)
  if (!isClosed) {
    let maxLineDev = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const dev = pointToSegmentDistance(points[i], startPt, endPt);
      if (dev > maxLineDev) maxLineDev = dev;
    }

    const chordLen = distance(startPt, endPt);
    // Straight line: points stay very close to the chord connecting start to end
    if (chordLen > 30 && maxLineDev / chordLen < 0.12 && totalLen / chordLen < 1.25) {
      return {
        type: 'line',
        confidence: 0.9,
        points: [startPt, endPt],
        bounds
      };
    }
  }

  // If closed loop, evaluate candidates: Circle, Rectangle, Diamond, Triangle
  if (isClosed && bounds.width >= 20 && bounds.height >= 20) {
    const diag = Math.hypot(bounds.width, bounds.height);
    const cx = bounds.centerX;
    const cy = bounds.centerY;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;

    // A. Circle Score
    let circleErrors = 0;
    for (const p of points) {
      const normDist = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
      circleErrors += Math.abs(normDist - 1.0);
    }
    const avgCircleError = circleErrors / points.length; // Acceptable if < 0.15

    // B. Rectangle Score
    let rectErrors = 0;
    for (const p of points) {
      const dTop = Math.abs(p.y - bounds.minY);
      const dBottom = Math.abs(p.y - bounds.maxY);
      const dLeft = Math.abs(p.x - bounds.minX);
      const dRight = Math.abs(p.x - bounds.maxX);
      rectErrors += Math.min(dTop, dBottom, dLeft, dRight);
    }
    const avgRectError = (rectErrors / points.length) / diag; // Acceptable if < 0.09

    // C. Diamond Score
    const top = { x: bounds.centerX, y: bounds.minY };
    const right = { x: bounds.maxX, y: bounds.centerY };
    const bottom = { x: bounds.centerX, y: bounds.maxY };
    const left = { x: bounds.minX, y: bounds.centerY };
    let diamondErrors = 0;
    for (const p of points) {
      const d1 = pointToSegmentDistance(p, top, right);
      const d2 = pointToSegmentDistance(p, right, bottom);
      const d3 = pointToSegmentDistance(p, bottom, left);
      const d4 = pointToSegmentDistance(p, left, top);
      diamondErrors += Math.min(d1, d2, d3, d4);
    }
    const avgDiamondError = (diamondErrors / points.length) / diag; // Acceptable if < 0.08

    // D. Triangle Score (top-centered isosceles triangle)
    const triTop = { x: bounds.centerX, y: bounds.minY };
    const triBottomLeft = { x: bounds.minX, y: bounds.maxY };
    const triBottomRight = { x: bounds.maxX, y: bounds.maxY };
    let triErrors = 0;
    for (const p of points) {
      const d1 = pointToSegmentDistance(p, triTop, triBottomRight);
      const d2 = pointToSegmentDistance(p, triBottomRight, triBottomLeft);
      const d3 = pointToSegmentDistance(p, triBottomLeft, triTop);
      triErrors += Math.min(d1, d2, d3);
    }
    const avgTriError = (triErrors / points.length) / diag; // Acceptable if < 0.085

    // Find candidate with lowest error that passes its threshold
    const candidates: { type: DetectedShapeType; error: number; threshold: number }[] = [
      { type: 'rectangle', error: avgRectError, threshold: 0.09 },
      { type: 'diamond', error: avgDiamondError, threshold: 0.08 },
      { type: 'triangle', error: avgTriError, threshold: 0.085 },
      { type: 'circle', error: avgCircleError, threshold: 0.16 }
    ];

    const valid = candidates.filter((c) => c.error < c.threshold);
    valid.sort((a, b) => a.error - b.error);

    if (valid.length > 0) {
      const winner = valid[0].type;

      if (winner === 'circle') {
        const cleanPoints: Point[] = [];
        const numSteps = 36;
        for (let i = 0; i <= numSteps; i++) {
          const theta = (i / numSteps) * Math.PI * 2;
          cleanPoints.push({
            x: cx + Math.cos(theta) * rx,
            y: cy + Math.sin(theta) * ry
          });
        }
        return {
          type: 'circle',
          confidence: Math.max(0.6, 1.0 - avgCircleError * 2),
          points: cleanPoints,
          bounds
        };
      }

      if (winner === 'rectangle') {
        const p1 = { x: bounds.minX, y: bounds.minY };
        const p2 = { x: bounds.maxX, y: bounds.minY };
        const p3 = { x: bounds.maxX, y: bounds.maxY };
        const p4 = { x: bounds.minX, y: bounds.maxY };
        return {
          type: 'rectangle',
          confidence: 0.88,
          points: [p1, p2, p3, p4, p1],
          bounds
        };
      }

      if (winner === 'diamond') {
        return {
          type: 'diamond',
          confidence: 0.85,
          points: [top, right, bottom, left, top],
          bounds
        };
      }

      if (winner === 'triangle') {
        return {
          type: 'triangle',
          confidence: 0.85,
          points: [triTop, triBottomRight, triBottomLeft, triTop],
          bounds
        };
      }
    }
  }

  return { type: 'none', confidence: 0, points, bounds };
}
