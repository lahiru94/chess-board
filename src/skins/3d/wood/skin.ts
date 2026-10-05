import type { Skin3D } from '../types.ts';

export const woodSkin: Skin3D = {
  name: 'Wood & Ivory',
  board: { light: '#e3c79f', dark: '#9a6a3f', frame: '#5c3b22', frameRoughness: 0.6, labels: '#e9d3ad' },
  pieces: {
    w: { color: '#f2e8d5', roughness: 0.42, metalness: 0 },
    b: { color: '#2e2019', roughness: 0.34, metalness: 0 },
  },
  highlight: { move: '#f2e35b', select: '#5fa36b', hover: '#ffffff', focus: '#3b82f6', amount: 0.5 },
  light: { sky: '#fff6e8', ground: '#4a3a2c', ambient: 1.1, sun: 2.2, shadowOpacity: 0.35 },
};
