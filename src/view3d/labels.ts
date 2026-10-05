// Rank and file labels printed on the 3D frame, like a real board: readable from
// white's side along white's edges, and from black's side along black's edges.
import { BufferAttribute, CanvasTexture, Mesh, MeshBasicMaterial, Path, Shape, ShapeGeometry, SRGBColorSpace } from 'three';

const SIZE = 1024; // texture px
const SPAN = 8.9; // frame width in board units
const PX = SIZE / SPAN;
const BAND = 4.225; // label line: middle of the frame border (4.0 .. 4.45)

/** The frame border only (a square ring), so the labels add no overdraw on the squares. */
function ringGeometry(): ShapeGeometry {
  const h = SPAN / 2;
  const outer = new Shape().moveTo(-h, -h).lineTo(h, -h).lineTo(h, h).lineTo(-h, h).closePath();
  outer.holes.push(new Path().moveTo(-4, -4).lineTo(-4, 4).lineTo(4, 4).lineTo(4, -4).closePath());
  const g = new ShapeGeometry(outer);
  // Shape UVs are raw x/y; map them onto the full label texture.
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + h) / SPAN;
    uv[i * 2 + 1] = (pos.getY(i) + h) / SPAN;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

function draw(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(PX * 0.3)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Canvas is the board seen from above with white at the bottom: x = world x, y = world z.
  const at = (x: number, z: number, text: string, upsideDown: boolean) => {
    ctx.save();
    ctx.translate((x + SPAN / 2) * PX, (z + SPAN / 2) * PX);
    if (upsideDown) ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (let i = 0; i < 8; i++) {
    const c = i - 3.5;
    const file = 'abcdefgh'[i] ?? '';
    const rank = String(8 - i);
    at(c, BAND, file, false); // white's edge
    at(c, -BAND, file, true); // black's edge
    at(-BAND, c, rank, false); // white's left
    at(BAND, c, rank, true); // black's left
  }
}

export class FrameLabels {
  readonly mesh: Mesh;
  #ctx: CanvasRenderingContext2D;
  #tex: CanvasTexture;

  constructor(color: string, anisotropy: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.#ctx = ctx;
    draw(ctx, color);
    this.#tex = new CanvasTexture(canvas);
    this.#tex.colorSpace = SRGBColorSpace;
    this.#tex.anisotropy = anisotropy;
    const mat = new MeshBasicMaterial({ map: this.#tex, transparent: true, depthWrite: false });
    this.mesh = new Mesh(ringGeometry(), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.001; // just above the frame top, below the squares
  }

  setColor(color: string): void {
    draw(this.#ctx, color);
    this.#tex.needsUpdate = true;
  }

  dispose(): void {
    this.#tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
