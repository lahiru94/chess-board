import { describe, expect, it } from 'vitest';
import {
  intersectCylinder,
  intersectPlane,
  pickPiece,
  squareAtPoint,
  squareCenter,
  type Ray,
} from '../../src/view3d/picking.ts';

const sq = (name: string) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

function rayTo(from: [number, number, number], to: [number, number, number]): Ray {
  const d = { x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] };
  const len = Math.hypot(d.x, d.y, d.z);
  return { origin: { x: from[0], y: from[1], z: from[2] }, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

describe('board coordinates', () => {
  it('maps squares to world centers and back', () => {
    expect(squareCenter(sq('a1'))).toEqual({ x: -3.5, z: 3.5 });
    expect(squareCenter(sq('h8'))).toEqual({ x: 3.5, z: -3.5 });
    for (let s = 0; s < 64; s++) {
      const { x, z } = squareCenter(s);
      expect(squareAtPoint(x, z)).toBe(s);
    }
  });

  it('returns null outside the board', () => {
    expect(squareAtPoint(4.1, 0)).toBeNull();
    expect(squareAtPoint(0, -4.1)).toBeNull();
  });
});

describe('intersectPlane', () => {
  it('hits the board plane from above', () => {
    const hit = intersectPlane(rayTo([0, 10, 10], [1, 0, 2]))!;
    expect(hit.x).toBeCloseTo(1);
    expect(hit.z).toBeCloseTo(2);
  });

  it('supports a raised plane and misses rays that point away or run parallel', () => {
    expect(intersectPlane(rayTo([0, 10, 0], [0, 0, 0]), 0.25)!.y).toBe(0.25);
    expect(intersectPlane(rayTo([0, 1, 0], [0, 2, 0]))).toBeNull();
    expect(intersectPlane({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } })).toBeNull();
  });
});

describe('intersectCylinder', () => {
  it('hits the side and the top cap, and misses beside it', () => {
    expect(intersectCylinder(rayTo([0, 0.5, 5], [0, 0.5, 0]), 0, 0, 1, 0.34)).toBeCloseTo(5 - 0.34);
    expect(intersectCylinder(rayTo([0, 5, 0], [0, 0, 0]), 0, 0, 1, 0.34)).toBeCloseTo(4);
    expect(intersectCylinder(rayTo([1, 5, 0], [1, 0, 0]), 0, 0, 1, 0.34)).toBeNull();
  });

  it('misses above the cylinder and behind the ray origin', () => {
    expect(intersectCylinder(rayTo([0, 3, 5], [0, 3, 0]), 0, 0, 1, 0.34)).toBeNull();
    expect(intersectCylinder(rayTo([0, 0.5, 5], [0, 0.5, 10]), 0, 0, 1, 0.34)).toBeNull();
  });
});

describe('pickPiece', () => {
  it('picks the tall piece whose head is in front of the square behind it', () => {
    // Low camera on white's side, aiming at e2's square plane from very low.
    // The ray passes through the king on e1 first.
    const pieces = [
      { id: 1, type: 'k' as const, square: sq('e1') },
      { id: 2, type: 'p' as const, square: sq('e3') },
    ];
    const target = squareCenter(sq('e3'));
    const ray = rayTo([target.x, 1.2, 8], [target.x, 0, target.z]);
    expect(pickPiece(ray, pieces)).toBe(1);
  });

  it('picks a pawn whose body shows just past the narrow head of the king in front', () => {
    // Default white camera; aim at the e2 pawn's body. The king on e1 is nearer the camera.
    const pieces = [
      { id: 1, type: 'k' as const, square: sq('e1') },
      { id: 2, type: 'p' as const, square: sq('e2') },
    ];
    const e2 = squareCenter(sq('e2'));
    expect(pickPiece(rayTo([0, 12.8, 11.2], [e2.x, 0.45, e2.z]), pieces)).toBe(2);
  });

  it('uses the wide base when the ray only clips the foot', () => {
    const a1 = squareCenter(sq('a1'));
    const ray = rayTo([a1.x + 0.35, 0.1, 6], [a1.x + 0.35, 0.1, a1.z]);
    expect(pickPiece(ray, [{ id: 7, type: 'p', square: sq('a1') }])).toBe(7);
  });

  it('returns null when nothing is hit', () => {
    expect(pickPiece(rayTo([0, 10, 0], [0.5, 0, 0.5]), [{ id: 1, type: 'p', square: sq('a1') }])).toBeNull();
  });
});
