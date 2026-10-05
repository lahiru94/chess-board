// Static shell markup, pre-rendered into index.html at build time. No DOM APIs here.
import type { Color, PieceType } from '../core/index.ts';

const NAMES: Record<PieceType, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const TYPES: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const COLORS: readonly Color[] = ['w', 'b'];

export function pieceName(type: PieceType, color: Color): string {
  return `${color === 'w' ? 'White' : 'Black'} ${NAMES[type]}`;
}

/** 12 drawer buttons, white row then black row. */
export function drawerMarkup(): string {
  return COLORS.flatMap((color) =>
    TYPES.map(
      (type) =>
        `<button class="dw-pc ${color}" data-type="${type}" data-color="${color}" aria-pressed="false" ` +
        `aria-label="${pieceName(type, color)}" title="${pieceName(type, color)}">` +
        `<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${type}"/></svg></button>`,
    ),
  ).join('');
}
