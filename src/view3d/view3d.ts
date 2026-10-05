import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Spherical,
  TOUCH,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Board, BoardDiff, Color as PieceColor, PieceId, PieceType, Square } from '../core/index.ts';
import type { Controller, InteractionState, Orientation } from '../interaction/index.ts';
import type { Skin3D } from '../skins/3d/types.ts';
import type { BoardView } from '../view-contract.ts';
import { handleBoardKey } from '../view-keys.ts';
import { fitDistance } from './camera-fit.ts';
import { buildPieceGeometries, buildSquaresGeometry } from './geometry.ts';
import { intersectPlane, pickPiece, squareAtPoint, squareCenter, type Ray } from './picking.ts';

const DRAG_THRESHOLD = 4;
const LIFT = 0.3; // height of a dragged piece
const CAMERA = { polar: 0.72, fov: 35 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

interface Press {
  pointerId: number;
  id: PieceId | null; // null: press on empty space (camera orbit or tap on a square)
  square: Square | null;
  startX: number;
  startY: number;
  moved: boolean;
  dragging: boolean;
}

interface Tween {
  t0: number;
  ms: number;
  step: (k: number) => void;
  done?: () => void;
}

const easeOut = (k: number) => 1 - (1 - k) ** 3;

/**
 * WebGL renderer (PLAN.md 6.3): renders on demand only, one mesh per piece with
 * shared geometry and materials, cylinder picking for pick-up, plane picking for drop.
 */
export class View3D implements BoardView {
  #el!: HTMLElement;
  #board!: Board;
  #ctl!: Controller;
  #skin: Skin3D;
  #sky!: HemisphereLight;
  #sun!: DirectionalLight;
  #lost = false;

  #renderer!: WebGLRenderer;
  #scene = new Scene();
  #camera = new PerspectiveCamera(CAMERA.fov, 1, 0.5, 120);
  #controls!: OrbitControls;
  #geoms!: Record<PieceType, BufferGeometry>;
  #mats!: Record<PieceColor, MeshStandardMaterial>;
  #squares!: Mesh;
  #frame!: Mesh;
  #meshes = new Map<PieceId, Mesh>();
  #orientation: Orientation = 'white';
  #fitted = 20; // camera distance that fits the board; set on resize
  #zoom = 1; // current distance / fitted distance

  #raf = 0;
  #tweens = new Map<object, Tween>();
  #rect: DOMRect | null = null;
  #press: Press | null = null;
  #pointer = { x: 0, y: 0 };
  #pointerFocus = false;
  #cleanup: (() => void)[] = [];

  #onLost: () => void;

  /** `onLost` runs when the browser drops the WebGL context (the app may rebuild the view). */
  constructor(skin: Skin3D, onLost: () => void = () => {}) {
    this.#skin = skin;
    this.#onLost = onLost;
  }

  /** True after the browser dropped the WebGL context and did not give it back (PLAN.md 6.4). */
  get lost(): boolean {
    return this.#lost;
  }

  /** Applies a 3D skin in place: materials, lights, and square colors. No rebuild. */
  setSkin(skin: Skin3D): void {
    this.#skin = skin;
    for (const c of ['w', 'b'] as const) {
      const m = this.#mats[c];
      m.color.set(skin.pieces[c].color);
      m.roughness = skin.pieces[c].roughness;
      m.metalness = skin.pieces[c].metalness;
    }
    const frame = this.#frame.material as MeshStandardMaterial;
    frame.color.set(skin.board.frame);
    frame.roughness = skin.board.frameRoughness;
    this.#sky.color.set(skin.light.sky);
    this.#sky.groundColor.set(skin.light.ground);
    this.#sky.intensity = skin.light.ambient;
    this.#sun.intensity = skin.light.sun;
    this.#paintSquares(this.#ctl.state);
    this.#shadowsDirty();
  }

  mount(el: HTMLElement, board: Board, ctl: Controller): void {
    this.#el = el;
    this.#board = board;
    this.#ctl = ctl;

    const r = (this.#renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; // updated only when pieces move
    r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    el.append(r.domElement);
    // three.js handles restore itself; we track the state so the app can rebuild if it never comes back.
    const onLost = () => {
      this.#lost = true;
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
      this.#onLost();
    };
    const onRestored = () => {
      this.#lost = false;
      this.#paintSquares(ctl.state);
      this.#shadowsDirty();
    };
    r.domElement.addEventListener('webglcontextlost', onLost);
    r.domElement.addEventListener('webglcontextrestored', onRestored);
    this.#cleanup.push(() => {
      r.domElement.removeEventListener('webglcontextlost', onLost);
      r.domElement.removeEventListener('webglcontextrestored', onRestored);
    });

    this.#buildScene();
    for (const { piece, square } of board.onBoard()) this.#addMesh(piece.id, piece.type, piece.color, square);

    const c = (this.#controls = new OrbitControls(this.#camera, r.domElement));
    c.enablePan = false;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = 1.38;
    c.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };
    c.addEventListener('change', this.#onCameraChange);
    this.#resize();
    this.#setCamera(ctl.state.orientation === 'white' ? 0 : Math.PI);
    this.#orientation = ctl.state.orientation;

    const ro = new ResizeObserver(() => this.#resize());
    ro.observe(el);
    const onScroll = () => (this.#rect = null);
    addEventListener('scroll', onScroll, { passive: true, capture: true });

    // Capture phase: a press on a piece is ours and never reaches OrbitControls (PLAN.md 2.5).
    this.#on(el, 'pointerdown', this.#onDown, true);
    this.#on(el, 'pointermove', this.#onMove, true);
    this.#on(el, 'pointerup', this.#onUp, true);
    this.#on(el, 'pointercancel', this.#onCancel, true);
    this.#on(el, 'keydown', (e) => handleBoardKey(e, ctl));
    this.#on(el, 'focus', () => !this.#pointerFocus && ctl.moveFocus(0, 0));
    this.#on(el, 'blur', () => ctl.blurFocus());
    this.#on(el, 'contextmenu', (e) => e.preventDefault());

    this.#cleanup.push(
      () => ro.disconnect(),
      () => removeEventListener('scroll', onScroll, { capture: true }),
      board.subscribe((e) => this.#applyDiff(e.diff)),
      ctl.subscribe((s) => this.#render(s)),
    );
    this.#resize();
    this.#render(ctl.state);
    this.#shadowsDirty(); // the shadow map is drawn only on demand, so draw it once now
  }

  unmount(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.#controls.dispose();
    for (const g of Object.values(this.#geoms)) g.dispose();
    for (const m of Object.values(this.#mats)) m.dispose();
    this.#squares.geometry.dispose();
    (this.#squares.material as MeshStandardMaterial).dispose();
    this.#frame.geometry.dispose();
    (this.#frame.material as MeshStandardMaterial).dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#meshes.clear();
    this.#tweens.clear();
    this.#scene.clear();
  }

  squareAt(clientX: number, clientY: number): Square | null {
    const hit = intersectPlane(this.#ray(clientX, clientY), 0);
    return hit ? squareAtPoint(hit.x, hit.z) : null;
  }

  // ---- Scene ----

  #buildScene(): void {
    const s = this.#skin;
    this.#geoms = buildPieceGeometries();
    this.#mats = {
      w: new MeshStandardMaterial({ ...s.pieces.w }),
      b: new MeshStandardMaterial({ ...s.pieces.b }),
    };

    this.#squares = new Mesh(buildSquaresGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
    this.#squares.receiveShadow = true;

    this.#frame = new Mesh(
      new BoxGeometry(8.9, 0.36, 8.9),
      new MeshStandardMaterial({ color: s.board.frame, roughness: s.board.frameRoughness }),
    );
    this.#frame.position.y = -0.183; // top sits just under the squares
    this.#frame.receiveShadow = true;

    const sky = (this.#sky = new HemisphereLight(s.light.sky, s.light.ground, s.light.ambient));
    const sun = (this.#sun = new DirectionalLight(0xffffff, s.light.sun));
    sun.position.set(3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;

    this.#scene.add(this.#squares, this.#frame, sky, sun);
  }

  #addMesh(id: PieceId, type: PieceType, color: PieceColor, sq: Square): Mesh {
    const mesh = new Mesh(this.#geoms[type], this.#mats[color]);
    const { x, z } = squareCenter(sq);
    mesh.position.set(x, 0, z);
    // Knights show their profile: white faces its left, black faces its left.
    if (type === 'n') mesh.rotation.y = color === 'w' ? 0 : Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.#scene.add(mesh);
    this.#meshes.set(id, mesh);
    return mesh;
  }

  // ---- Board changes ----

  #applyDiff(diff: BoardDiff): void {
    for (const { id, to } of diff.moved) {
      const mesh = this.#meshes.get(id);
      if (mesh) this.#glide(mesh, to);
    }
    for (const { id } of diff.removed) {
      const mesh = this.#meshes.get(id);
      if (!mesh) continue;
      this.#meshes.delete(id);
      const y0 = mesh.position.y;
      this.#tween(mesh, 250, (k) => {
        mesh.scale.setScalar(Math.max(0.001, 1 - k));
        mesh.position.y = y0 + 0.5 * k;
      }, () => this.#scene.remove(mesh));
    }
    for (const { id, to } of diff.added) {
      const p = this.#board.piece(id);
      if (!p) continue;
      const mesh = this.#addMesh(id, p.type, p.color, to);
      mesh.scale.setScalar(0.001);
      this.#tween(mesh, 200, (k) => mesh.scale.setScalar(Math.max(0.001, easeOut(k))));
    }
    this.#shadowsDirty();
  }

  #glide(mesh: Mesh, sq: Square): void {
    const { x, z } = squareCenter(sq);
    const from = mesh.position.clone();
    this.#tween(mesh, 180, (k) => {
      const e = easeOut(k);
      mesh.position.set(from.x + (x - from.x) * e, from.y * (1 - e), from.z + (z - from.z) * e);
    });
  }

  // ---- View state ----

  #render(s: InteractionState): void {
    if (s.orientation !== this.#orientation) {
      this.#orientation = s.orientation;
      this.#turnCamera(s.orientation === 'white' ? 0 : Math.PI);
    }
    this.#paintSquares(s);
    this.#invalidate();
  }

  /** Square colors with highlights mixed in, written into the vertex colors. */
  #paintSquares(s: InteractionState): void {
    const sk = this.#skin;
    const hl = new Map<Square, string>();
    if (s.lastMove) {
      if (s.lastMove.from != null) hl.set(s.lastMove.from, sk.highlight.move);
      hl.set(s.lastMove.to, sk.highlight.move);
    }
    if (s.selected?.kind === 'board') {
      const sq = this.#board.squareOf(s.selected.id);
      if (sq != null) hl.set(sq, sk.highlight.select);
    }
    if (s.dragging && s.hover != null) hl.set(s.hover, sk.highlight.hover);
    if (s.focus != null) hl.set(s.focus, sk.highlight.focus);

    const attr = this.#squares.geometry.getAttribute('color');
    const arr = attr.array as Float32Array;
    const light = new Color(sk.board.light);
    const dark = new Color(sk.board.dark);
    const tint = new Color();
    const c = new Color();
    for (let sq = 0; sq < 64; sq++) {
      c.copy(((sq & 7) + (sq >> 3)) % 2 ? light : dark);
      const h = hl.get(sq);
      if (h) c.lerp(tint.set(h), sk.highlight.amount);
      for (let v = 0; v < 6; v++) arr.set([c.r, c.g, c.b], (sq * 6 + v) * 3);
    }
    attr.needsUpdate = true;
  }

  // ---- Camera ----

  #setCamera(theta: number): void {
    this.#zoom = 1;
    this.#camera.position.setFromSpherical(new Spherical(this.#fitted, CAMERA.polar, theta));
    this.#camera.lookAt(0, 0, 0);
    this.#controls.update();
  }

  /** Rotate around the board to the other side, keeping the user's zoom and tilt. */
  #turnCamera(theta: number): void {
    const sph = new Spherical().setFromVector3(this.#camera.position);
    let delta = (theta - sph.theta) % (2 * Math.PI);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const start = sph.theta;
    const apply = (k: number) => {
      sph.theta = start + delta * easeOut(k);
      this.#camera.position.setFromSpherical(sph);
      this.#camera.lookAt(0, 0, 0);
      this.#controls.update();
    };
    if (reducedMotion.matches) apply(1);
    else this.#tween(this.#camera, 600, apply);
  }

  #onCameraChange = (): void => {
    this.#zoom = this.#camera.position.length() / this.#fitted;
    this.#invalidate();
  };

  #resize(): void {
    const w = this.#el.clientWidth;
    const h = this.#el.clientHeight;
    if (!w || !h) return;
    this.#rect = null;
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
    this.#fitCamera();
    this.#invalidate();
  }

  /**
   * Distance at which the whole board, corners and tall corner pieces included, stays on
   * screen at every orbit angle. It is the start distance; the user may zoom in closer.
   */
  #fitCamera(): void {
    const pos = this.#camera.position;
    const d = fitDistance(CAMERA.polar, this.#camera.aspect, CAMERA.fov);
    this.#fitted = d;
    this.#controls.minDistance = d * 0.55;
    this.#controls.maxDistance = d * 2;
    // Keep the user's relative zoom when the view is resized.
    if (pos.lengthSq() > 0) {
      pos.setLength(d * this.#zoom);
      this.#controls.update();
    }
  }

  // ---- Render on demand ----

  #invalidate = (): void => {
    if (!this.#lost) this.#raf ||= requestAnimationFrame(this.#frameTick);
  };

  #shadowsDirty(): void {
    this.#renderer.shadowMap.needsUpdate = true;
    this.#invalidate();
  }

  #tween(key: object, ms: number, step: (k: number) => void, done?: () => void): void {
    if (reducedMotion.matches) {
      step(1);
      done?.();
      this.#shadowsDirty();
      return;
    }
    this.#tweens.set(key, { t0: performance.now(), ms, step, ...(done ? { done } : {}) });
    this.#invalidate();
  }

  #frameTick = (now: number): void => {
    this.#raf = 0;
    if (this.#press?.dragging) this.#dragStep();
    if (this.#tweens.size) {
      for (const [key, t] of this.#tweens) {
        const k = Math.min(1, (now - t.t0) / t.ms);
        t.step(k);
        if (k === 1) {
          this.#tweens.delete(key);
          t.done?.();
        }
      }
      this.#renderer.shadowMap.needsUpdate = true;
      if (this.#tweens.size) this.#invalidate();
    }
    this.#renderer.render(this.#scene, this.#camera);
  };

  // ---- Pointer input ----

  #ray(clientX: number, clientY: number): Ray {
    const r = (this.#rect ??= this.#el.getBoundingClientRect());
    const ndc = new Vector3(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    const origin = this.#camera.position;
    const dir = ndc.unproject(this.#camera).sub(origin).normalize();
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } };
  }

  #onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.#press) {
      // A second finger: give the gesture to the camera.
      if (this.#press.dragging && this.#press.id != null) this.#endDrag(this.#press.id, null, false);
      this.#press = null;
      return;
    }
    this.#rect = this.#el.getBoundingClientRect();
    const ray = this.#ray(e.clientX, e.clientY);
    const pieces = this.#board.onBoard().map(({ piece, square }) => ({ id: piece.id, type: piece.type, square }));
    const id = pickPiece(ray, pieces);
    const plane = intersectPlane(ray, 0);
    const square = id != null ? this.#board.squareOf(id) : plane ? squareAtPoint(plane.x, plane.z) : null;
    this.#press = { pointerId: e.pointerId, id, square, startX: e.clientX, startY: e.clientY, moved: false, dragging: false };

    this.#pointerFocus = true;
    this.#el.focus({ preventScroll: true });
    this.#pointerFocus = false;
    if (id == null) return; // let OrbitControls see it
    e.stopPropagation();
    e.preventDefault();
    this.#el.setPointerCapture(e.pointerId);
  };

  #onMove = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.#pointer = { x: e.clientX, y: e.clientY };
    if (!p.moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) >= DRAG_THRESHOLD) p.moved = true;
    if (p.id == null || !p.moved) return;
    e.stopPropagation();
    if (!p.dragging) {
      p.dragging = true;
      this.#controls.enabled = false;
      this.#ctl.pickUp({ kind: 'board', id: p.id });
    }
    this.#invalidate();
  };

  /** Runs inside the frame: one ray per frame while dragging. */
  #dragStep(): void {
    const p = this.#press;
    const mesh = p?.id != null ? this.#meshes.get(p.id) : undefined;
    if (!mesh) return;
    const ray = this.#ray(this.#pointer.x, this.#pointer.y);
    const lifted = intersectPlane(ray, LIFT);
    if (lifted) mesh.position.set(lifted.x, LIFT, lifted.z);
    const ground = intersectPlane(ray, 0);
    this.#ctl.hover(ground ? squareAtPoint(ground.x, ground.z) : null);
    this.#renderer.shadowMap.needsUpdate = true;
  }

  #onUp = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.#press = null;
    if (p.dragging && p.id != null) {
      e.stopPropagation();
      this.#endDrag(p.id, this.squareAt(e.clientX, e.clientY), true);
    } else if (!p.moved && p.square != null) {
      this.#ctl.tap(p.square);
    }
  };

  #onCancel = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.#press = null;
    if (p.dragging && p.id != null) this.#endDrag(p.id, null, false);
  };

  #endDrag(id: PieceId, sq: Square | null, commit: boolean): void {
    this.#controls.enabled = true;
    if (commit) this.#ctl.drop(sq);
    else this.#ctl.cancel();
    // A drop that changed nothing: glide back to the square.
    const home = this.#board.squareOf(id);
    const mesh = this.#meshes.get(id);
    if (mesh && home != null) this.#glide(mesh, home);
  }

  #on<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    capture = false,
  ): void {
    el.addEventListener(type, fn, { capture });
    this.#cleanup.push(() => el.removeEventListener(type, fn, { capture }));
  }
}
