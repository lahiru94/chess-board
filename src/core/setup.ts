import type { Color, PieceType } from './types';

const BACK_RANK: readonly PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export interface StartPiece {
  readonly square: number;
  readonly type: PieceType;
  readonly color: Color;
}

/** The standard start position, in a fixed order so piece IDs 1..32 are stable. */
export const START_POSITION: readonly StartPiece[] = [
  ...BACK_RANK.map((type, file) => ({ square: file, type, color: 'w' as const })),
  ...BACK_RANK.map((_, file) => ({ square: 8 + file, type: 'p' as const, color: 'w' as const })),
  ...BACK_RANK.map((_, file) => ({ square: 48 + file, type: 'p' as const, color: 'b' as const })),
  ...BACK_RANK.map((type, file) => ({ square: 56 + file, type, color: 'b' as const })),
];
