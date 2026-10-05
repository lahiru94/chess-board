// Camera distance that keeps the whole board on screen (PLAN.md 6.3).
// Plain math, no three.js, so it can be tested in Node.

type V = readonly [number, number, number];

const HALF = 4.45; // frame half-width (board 8 + border)
const FRAME_DEPTH = 0.36;
const TALLEST = 1.4; // king height; corner squares can hold any piece

/** Points that must stay visible: frame corners (top and bottom) and a tall piece on each corner square. */
const POINTS: readonly V[] = [
  ...[-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sz): V[] => [
      [sx * HALF, 0, sz * HALF],
      [sx * HALF, -FRAME_DEPTH, sz * HALF],
      [sx * 3.5, TALLEST, sz * 3.5],
    ]),
  ),
];

const AZIMUTH_SAMPLES = 24;
const MARGIN = 0.94; // keep points inside 94% of the view

/** True if every point projects inside the view for a camera at (distance, polar, azimuth) looking at the origin. */
function fits(distance: number, polar: number, azimuth: number, tanY: number, tanX: number): boolean {
  const sp = Math.sin(polar);
  const cam: V = [distance * sp * Math.sin(azimuth), distance * Math.cos(polar), distance * sp * Math.cos(azimuth)];
  // Camera basis: forward toward the origin, right = forward × up, up = right × forward.
  const f: V = [-cam[0] / distance, -cam[1] / distance, -cam[2] / distance];
  const rl = Math.hypot(f[2], f[0]);
  const r: V = [-f[2] / rl, 0, f[0] / rl];
  const u: V = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  for (const p of POINTS) {
    const d: V = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z <= 0) return false;
    const x = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (z * tanX);
    const y = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (z * tanY);
    if (Math.abs(x) > MARGIN || Math.abs(y) > MARGIN) return false;
  }
  return true;
}

/**
 * Smallest camera distance at which the board fits for every azimuth at this tilt.
 * Checking all azimuths keeps the distance steady while the user orbits.
 */
export function fitDistance(polar: number, aspect: number, fovDeg: number): number {
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  const tanX = tanY * aspect;
  const fitsAll = (d: number) => {
    for (let i = 0; i < AZIMUTH_SAMPLES; i++) {
      if (!fits(d, polar, (i / AZIMUTH_SAMPLES) * 2 * Math.PI, tanY, tanX)) return false;
    }
    return true;
  };
  let lo = 4;
  let hi = 80;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAll(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
