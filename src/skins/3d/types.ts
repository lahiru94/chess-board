/** A 3D skin is data only (PLAN.md 5.5). Colors are CSS hex strings. */
export interface PieceMaterial {
  color: string;
  roughness: number;
  metalness: number;
}

export interface Skin3D {
  name: string;
  board: { light: string; dark: string; frame: string; frameRoughness: number; labels: string };
  pieces: { w: PieceMaterial; b: PieceMaterial };
  /** Square tints, mixed over the square color by `amount`. */
  highlight: {
    move: string;
    select: string;
    hover: string;
    focus: string;
    amount: number;
  };
  light: { sky: string; ground: string; ambient: number; sun: number; shadowOpacity: number };
}
