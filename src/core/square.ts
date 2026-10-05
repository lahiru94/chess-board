import type { Square } from './types.ts';

const FILES = 'abcdefgh';

export function toSquare(file: number, rank: number): Square {
  return rank * 8 + file;
}

export function fileOf(sq: Square): number {
  return sq & 7;
}

export function rankOf(sq: Square): number {
  return sq >> 3;
}

export function isSquare(n: number): n is Square {
  return Number.isInteger(n) && n >= 0 && n < 64;
}

export function squareName(sq: Square): string {
  return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
}
