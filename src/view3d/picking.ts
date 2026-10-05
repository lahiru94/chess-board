// Pointer → piece and pointer → square for the 3D view (PLAN.md 5.3, 6.3).
// Plain math, no three.js and no DOM, so it is cheap per event and testable in Node.
import type { PieceId, PieceType, Square } from '../core/index.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

/** World layout: squares are 1 unit, the board spans -4..4 on x and z, top at y = 0. White sits at +z. */
export function squareCenter(sq: Square): { x: number; z: number } {
  return { x: (sq & 7) - 3.5, z: 3.5 - (sq >> 3) };
}

export function squareAtPoint(x: number, z: number): Square | null {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return rank * 8 + file;
}

/** Where the ray meets the horizontal plane y = h, or null if it points away from it. */
export function intersectPlane(ray: Ray, h = 0): Vec3 | null {
  const { origin: o, dir: d } = ray;
  if (Math.abs(d.y) < 1e-9) return null;
  const t = (h - o.y) / d.y;
  if (t < 0) return null;
  return { x: o.x + t * d.x, y: h, z: o.z + t * d.z };
}

/**
 * Hit shape for each piece type: a wide base cylinder plus a narrower upper one,
 * close to the lathe models, so a tall piece does not cover the piece in front of it.
 */
const BASE = { r: 0.38, h: 0.3 };
export const PIECE_HIT: Record<PieceType, { r: number; h: number }> = {
  p: { r: 0.2, h: 0.78 },
  r: { r: 0.29, h: 0.88 },
  n: { r: 0.3, h: 1.0 },
  b: { r: 0.21, h: 1.1 },
  q: { r: 0.24, h: 1.27 },
  k: { r: 0.24, h: 1.4 },
};

/**
 * Distance along the ray to a vertical cylinder (side or top cap), or null on a miss.
 * Tall pieces are hit at their head, not at the square behind them.
 */
export function intersectCylinder(ray: Ray, cx: number, cz: number, height: number, r: number): number | null {
  const { origin: o, dir: d } = ray;
  let best: number | null = null;
  const ox = o.x - cx;
  const oz = o.z - cz;

  // Side: (ox + t dx)^2 + (oz + t dz)^2 = r^2
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-12) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const y = o.y + t * d.y;
      if (t >= 0 && y >= 0 && y <= height) best = t;
    }
  }

  // Top cap
  if (Math.abs(d.y) > 1e-12) {
    const t = (height - o.y) / d.y;
    if (t >= 0 && (best === null || t < best)) {
      const x = ox + t * d.x;
      const z = oz + t * d.z;
      if (x * x + z * z <= r * r) best = t;
    }
  }
  return best;
}

/** Nearest piece hit by the ray. */
export function pickPiece(
  ray: Ray,
  pieces: Iterable<{ id: PieceId; type: PieceType; square: Square }>,
): PieceId | null {
  let bestId: PieceId | null = null;
  let bestT = Infinity;
  for (const p of pieces) {
    const { x, z } = squareCenter(p.square);
    const hit = PIECE_HIT[p.type];
    const tBase = intersectCylinder(ray, x, z, BASE.h, BASE.r);
    const tUpper = intersectCylinder(ray, x, z, hit.h, hit.r);
    const t = tBase === null ? tUpper : tUpper === null ? tBase : Math.min(tBase, tUpper);
    if (t !== null && t < bestT) {
      bestT = t;
      bestId = p.id;
    }
  }
  return bestId;
}
