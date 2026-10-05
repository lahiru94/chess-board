import { describe, expect, it } from 'vitest';
import { fileOf, isSquare, rankOf, squareName, toSquare } from '../../src/core/square.ts';

describe('square helpers', () => {
  it('maps file and rank to an index and back', () => {
    expect(toSquare(0, 0)).toBe(0);
    expect(toSquare(7, 7)).toBe(63);
    expect(fileOf(toSquare(5, 2))).toBe(5);
    expect(rankOf(toSquare(5, 2))).toBe(2);
  });

  it('names squares in algebraic notation', () => {
    expect(squareName(0)).toBe('a1');
    expect(squareName(63)).toBe('h8');
    expect(squareName(toSquare(4, 3))).toBe('e4');
  });

  it('accepts only 0..63 integers', () => {
    expect(isSquare(0)).toBe(true);
    expect(isSquare(63)).toBe(true);
    expect(isSquare(64)).toBe(false);
    expect(isSquare(-1)).toBe(false);
    expect(isSquare(1.5)).toBe(false);
  });
});
