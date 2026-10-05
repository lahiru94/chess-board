// Board markup as strings. Used by the build (pre-render into index.html) and by
// the 2D view at runtime, so both always produce identical DOM (PLAN.md 6.1).
// Must stay free of DOM APIs: it runs in Node at build time.
import { fileOf, rankOf, type Piece, type Square } from '../core/index.ts';
import type { Orientation } from '../interaction/index.ts';

const FILES = 'abcdefgh';

/** Screen cell (col 0 = left, row 0 = top) for a board square. */
export function cellOf(sq: Square, o: Orientation): { col: number; row: number } {
  return o === 'white' ? { col: fileOf(sq), row: 7 - rankOf(sq) } : { col: 7 - fileOf(sq), row: rankOf(sq) };
}

/** Each cell element is 1/8 of the board, so a translate in % of itself lands on a cell. */
export function cellTransform(sq: Square, o: Orientation): string {
  const { col, row } = cellOf(sq, o);
  return `translate(${col * 100}%,${row * 100}%)`;
}

export function pieceMarkup(p: Piece, sq: Square, o: Orientation): string {
  return (
    `<div class="pc ${p.color}" data-id="${p.id}" style="transform:${cellTransform(sq, o)}">` +
    `<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${p.type}"/></svg></div>`
  );
}

/** File letters along the bottom row and rank numbers down the left column. */
export function coordsMarkup(o: Orientation): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    const file = o === 'white' ? FILES[i] : FILES[7 - i];
    const rank = o === 'white' ? 8 - i : i + 1;
    // Cell (col,row) is dark when col+row is odd, in both orientations; labels take the opposite color.
    out += `<span class="co co-f ${(i + 7) % 2 ? 'on-d' : 'on-l'}" style="transform:translate(${i * 100}%,700%)">${file}</span>`;
    out += `<span class="co co-r ${i % 2 ? 'on-d' : 'on-l'}" style="transform:translate(0,${i * 100}%)">${rank}</span>`;
  }
  return out;
}

const HIGHLIGHTS = ['from', 'to', 'sel', 'hover', 'focus'] as const;
export type HighlightName = (typeof HIGHLIGHTS)[number];

export function boardMarkup(pieces: readonly { piece: Piece; square: Square }[], o: Orientation): string {
  return (
    `<div class="coords">${coordsMarkup(o)}</div>` +
    HIGHLIGHTS.map((h) => `<div class="hl hl-${h}" hidden></div>`).join('') +
    pieces.map(({ piece, square }) => pieceMarkup(piece, square, o)).join('')
  );
}
