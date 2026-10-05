import type { BoardDiff, PieceId, Square } from './types';

type Cells = readonly (PieceId | null)[];

/** Compares two boards by piece identity. 64 cells, so a full scan is cheaper than bookkeeping. */
export function diffSquares(before: Cells, after: Cells): BoardDiff {
  const from = new Map<PieceId, Square>();
  const to = new Map<PieceId, Square>();
  for (let sq = 0; sq < 64; sq++) {
    const a = before[sq];
    const b = after[sq];
    if (a != null) from.set(a, sq);
    if (b != null) to.set(b, sq);
  }

  const moved: { id: PieceId; from: Square; to: Square }[] = [];
  const added: { id: PieceId; to: Square }[] = [];
  const removed: { id: PieceId; from: Square }[] = [];

  for (const [id, sq] of to) {
    const old = from.get(id);
    if (old === undefined) added.push({ id, to: sq });
    else if (old !== sq) moved.push({ id, from: old, to: sq });
  }
  for (const [id, sq] of from) {
    if (!to.has(id)) removed.push({ id, from: sq });
  }
  return { moved, added, removed };
}
