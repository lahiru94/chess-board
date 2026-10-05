// Piece and board geometry built in code: no model files to download (PLAN.md 4).
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceType } from '../core/index.ts';

type Profile = readonly (readonly [number, number])[];

// Lathe profiles: [radius, height] from the base up, in board units (a square is 1).
const FOOT: Profile = [[0, 0], [0.4, 0], [0.4, 0.07], [0.34, 0.11], [0.3, 0.15]];

const PROFILES: Record<Exclude<PieceType, 'n'>, Profile> = {
  p: [...FOOT.slice(0, 4), [0.29, 0.13], [0.2, 0.22], [0.13, 0.4], [0.2, 0.44], [0.2, 0.47], [0.11, 0.49], [0.16, 0.55], [0.18, 0.62], [0.16, 0.69], [0.1, 0.74], [0, 0.76]],
  r: [...FOOT, [0.26, 0.25], [0.23, 0.6], [0.29, 0.64], [0.29, 0.86], [0.22, 0.86], [0.22, 0.79], [0, 0.79]],
  b: [...FOOT, [0.18, 0.3], [0.13, 0.55], [0.21, 0.59], [0.21, 0.62], [0.13, 0.64], [0.19, 0.74], [0.2, 0.82], [0.15, 0.92], [0.07, 0.98], [0.05, 1.0], [0.08, 1.03], [0.04, 1.07], [0, 1.08]],
  q: [...FOOT, [0.19, 0.35], [0.14, 0.65], [0.23, 0.7], [0.23, 0.73], [0.15, 0.75], [0.2, 0.95], [0.25, 1.08], [0.2, 1.1], [0.12, 1.12], [0.07, 1.17], [0.09, 1.2], [0.05, 1.24], [0, 1.25]],
  k: [...FOOT, [0.19, 0.35], [0.15, 0.7], [0.24, 0.75], [0.24, 0.78], [0.16, 0.8], [0.21, 1.0], [0.23, 1.1], [0.15, 1.13], [0.08, 1.15], [0, 1.15]],
};

const KNIGHT_FOOT: Profile = [...FOOT, [0.28, 0.2], [0, 0.2]];

// Knight head silhouette [forward, up]; it faces -x and is extruded across z.
const KNIGHT_HEAD: Profile = [
  [0.22, 0.18], [0.25, 0.5], [0.17, 0.76], [0.06, 0.92], [0.03, 1.0], [-0.04, 0.88],
  [-0.27, 0.66], [-0.31, 0.56], [-0.25, 0.5], [-0.07, 0.55], [-0.13, 0.35], [-0.2, 0.18],
];

const SEGMENTS = 32;

function lathe(profile: Profile): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    SEGMENTS,
  ).toNonIndexed();
}

function knight(): BufferGeometry {
  const shape = new Shape(KNIGHT_HEAD.map(([u, v]) => new Vector2(u, v)));
  const depth = 0.2;
  const head = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 4,
  });
  head.translate(0, 0, -depth / 2);
  return mergeGeometries([lathe(KNIGHT_FOOT), head]);
}

function king(): BufferGeometry {
  const upright = new BoxGeometry(0.07, 0.27, 0.07).translate(0, 1.27, 0).toNonIndexed();
  const arm = new BoxGeometry(0.2, 0.07, 0.07).translate(0, 1.3, 0).toNonIndexed();
  return mergeGeometries([lathe(PROFILES.k), upright, arm]);
}

/** One shared geometry per piece type. */
export function buildPieceGeometries(): Record<PieceType, BufferGeometry> {
  return {
    p: lathe(PROFILES.p),
    r: lathe(PROFILES.r),
    n: knight(),
    b: lathe(PROFILES.b),
    q: lathe(PROFILES.q),
    k: king(),
  };
}

/** 64 squares as one mesh with per-vertex colors: one draw call, recolored for highlights. */
export function buildSquaresGeometry(): BufferGeometry {
  const positions = new Float32Array(64 * 6 * 3);
  const normals = new Float32Array(64 * 6 * 3);
  let i = 0;
  for (let sq = 0; sq < 64; sq++) {
    const x0 = (sq & 7) - 4;
    const z0 = 3 - (sq >> 3);
    // Two triangles, counter-clockwise seen from above.
    const corners = [[x0, z0 + 1], [x0 + 1, z0 + 1], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0], [x0, z0]] as const;
    for (const [x, z] of corners) {
      positions[i] = x;
      positions[i + 2] = z;
      normals[i + 1] = 1;
      i += 3;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(64 * 6 * 3), 3));
  return g;
}
