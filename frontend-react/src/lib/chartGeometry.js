/**
 * Pure SVG Chart Geometry Helpers
 * Business Market Monitor — Landing Page Visualizations
 *
 * Provides deterministic, unit-testable SVG coordinate mapping and path generation.
 * Zero external dependencies. Safe for SSR and client-side pointer interactions.
 */

/**
 * Creates a 1D linear scale function mapping domain [d0, d1] to range [r0, r1].
 * Handles zero-span domains safely by returning range midpoint.
 *
 * @param {{ domain: [number, number], range: [number, number] }} options
 * @returns {(val: number) => number}
 */
export function scaleLinear({ domain, range }) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;

  return function (val) {
    if (span === 0) return (r0 + r1) / 2;
    const t = (val - d0) / span;
    return r0 + t * (r1 - r0);
  };
}

/**
 * Resolves padding argument to { top, right, bottom, left } numbers.
 */
function resolvePadding(pad = 0) {
  if (typeof pad === 'number') {
    return { top: pad, right: pad, bottom: pad, left: pad };
  }
  return {
    top: pad.top ?? 0,
    right: pad.right ?? 0,
    bottom: pad.bottom ?? 0,
    left: pad.left ?? 0,
  };
}

/**
 * Extracts a numeric array from numbers, objects with `price`, or [x, y] tuples.
 */
function extractValues(points) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => {
    if (typeof p === 'number') return p;
    if (p && typeof p.price === 'number') return p.price;
    if (Array.isArray(p) && typeof p[1] === 'number') return p[1];
    return Number(p) || 0;
  });
}

/**
 * Builds an SVG `d` path string representing a continuous polyline.
 *
 * @param {Array<number|{price:number}>} points Array of data points
 * @param {number} w Viewbox width
 * @param {number} h Viewbox height
 * @param {number|{top?:number,right?:number,bottom?:number,left?:number}} [pad=0] Viewbox padding
 * @returns {string} SVG path `d` attribute
 */
export function buildLinePath(points, w, h, pad = 0) {
  const values = extractValues(points);
  const n = values.length;
  if (n === 0) return '';

  const { top, right, bottom, left } = resolvePadding(pad);
  const usableWidth = Math.max(1, w - left - right);
  const usableHeight = Math.max(1, h - top - bottom);

  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xScale = scaleLinear({ domain: [0, Math.max(1, n - 1)], range: [left, left + usableWidth] });
  const yScale = scaleLinear({ domain: [yMin, yMax], range: [top + usableHeight, top] });

  return values
    .map((val, i) => {
      const x = xScale(i).toFixed(2);
      const y = yScale(val).toFixed(2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

/**
 * Builds an SVG `d` path string for a filled area under the line path,
 * closed at the bottom boundary (h - padBottom).
 *
 * @param {Array<number|{price:number}>} points Array of data points
 * @param {number} w Viewbox width
 * @param {number} h Viewbox height
 * @param {number|{top?:number,right?:number,bottom?:number,left?:number}} [pad=0] Viewbox padding
 * @returns {string} SVG path `d` attribute
 */
export function buildAreaPath(points, w, h, pad = 0) {
  const values = extractValues(points);
  const n = values.length;
  if (n === 0) return '';

  const linePath = buildLinePath(values, w, h, pad);
  if (!linePath) return '';

  const { bottom, left, right } = resolvePadding(pad);
  const groundY = (h - bottom).toFixed(2);
  const startX = left.toFixed(2);
  const endX = (w - right).toFixed(2);

  return `${linePath} L ${endX} ${groundY} L ${startX} ${groundY} Z`;
}

/**
 * Calculates the nearest index in a uniformly-spaced series [0 .. n-1] for an x-coordinate.
 * Clamps result safely between 0 and n-1.
 *
 * @param {number} x Mouse or touch x coordinate in SVG viewBox space
 * @param {number} n Total number of data points
 * @param {number} w Width of SVG viewBox
 * @returns {number} Integer index [0 .. n - 1]
 */
export function nearestIndex(x, n, w) {
  if (!n || n <= 1 || w <= 0) return 0;
  const clampedX = Math.max(0, Math.min(w, Number(x) || 0));
  const idx = Math.round((clampedX / w) * (n - 1));
  return Math.max(0, Math.min(n - 1, idx));
}
