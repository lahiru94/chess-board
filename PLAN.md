# Chess Board Web App — Plan

Status: M1 done. Next: M2 (core). Date: 2026-10-05.

This plan uses simplified technical English (close to ASD-STE100).
Sentences are short. One instruction is in each sentence.
The diagrams in `docs/plan-explainer.html` show the complex parts.

---

## 1. Goal

Make a chess board web app. The user moves pieces for both sides.
The app does not play chess. The app does not check if a move is legal.
The app behaves like a physical board on a table, with a box of spare pieces next to it.

---

## 2. Functional requirements

| ID  | Requirement |
|-----|-------------|
| F1  | Show a standard 8×8 chess board. |
| F2  | Load the board with the standard start position. |
| F3  | Let the user move any piece to any square. Do not check chess rules. |
| F4  | Allow one piece on each square only. |
| F5  | Let the user move pieces for white and for black. |
| F6  | Let the user rotate the board (white at the bottom, or black at the bottom). |
| F7  | Give a flat 2D view and a 3D view. Let the user change between them at any time. |
| F8  | Support skins for the 2D view and for the 3D view. Supply one skin for each view first. |
| F9  | Let the user reset the board to the start position. |
| F10 | Let the user undo and redo board changes. The controls are very small. |
| F11 | Do not save the position. A page reload shows the start position. |
| F12 | Give a piece drawer. The user can add pieces to the board from it and remove pieces from the board to it. |

### 2.1 Capture rule (decided)

F4 permits one piece on each square. On a physical board, the player removes the old piece. This is a capture.

We will do the same:

1. The user drops piece A on a square that has piece B.
2. The app removes piece B from the board.
3. Piece B moves off the board toward the drawer with a short animation (about 250 ms), then disappears.
4. The app puts piece A on the square.

To get a captured piece back, the user uses undo, or takes a new piece from the drawer.

### 2.2 Piece drawer (decided)

The drawer is the "box of spare pieces" next to a physical board.
It lets the user do things that the start position cannot do, for example pawn promotion.

- The drawer holds the 12 piece kinds (6 types × 2 colors).
- The supply is unlimited. Each drag from the drawer makes a new piece.
- **Add:** drag a piece from the drawer to a square. If the square has a piece, the capture rule (2.1) applies.
- **Remove:** drag a piece from the board to the drawer, or drop it outside the board. The piece goes away.
- **Promotion example:** drag the pawn off the board. Then drag a queen from the drawer to the square. This is two steps, as on a physical board. Each step is one undo step.
- The drawer is small. It is a thin strip next to the board (at the side on wide screens, below the board on narrow screens). A small button opens and closes it. It is closed at start.
- The drawer is part of the app shell, not of a view. It works the same in 2D and 3D. It shows the pieces with the current 2D skin.
- The board cannot hold more than 64 pieces (F4 makes this automatic).

### 2.3 Undo and redo (decided)

- Undo and redo apply to every board change: move, capture, add, remove, and reset.
- The controls are two small icon buttons (about 24 px, low contrast until hover or focus).
- Keyboard: `Ctrl/Cmd + Z` is undo. `Ctrl/Cmd + Shift + Z` and `Ctrl + Y` are redo.
- An undo of a capture or a remove brings the piece back with the reverse animation.
- A new change after an undo clears the redo history.
- Rotate, view change, skin change, and drawer open/close are view state. Undo does not apply to them.

### 2.4 Input methods

- Drag and drop with mouse, touch, and pen (Pointer Events).
- Click a piece, then click a square (good for touch and for accessibility).
- Keyboard: arrow keys move a focus ring. Enter selects. Enter again drops. Escape cancels. `Delete` removes the selected piece.

### 2.5 3D gestures (decided)

Drag-a-piece and rotate-the-camera both use a pointer drag. This rule removes the conflict:

- Press on a piece, then drag: the piece moves. The camera does not move.
- Press on empty space or the board edge, then drag: the camera orbits.
- Touch: one finger follows the two rules above. Two fingers always orbit and zoom.
- Mouse wheel zooms.
- While a piece is in a drag, the camera control is off.

---

## 3. Non-functional requirements

| ID  | Requirement | Target |
|-----|-------------|--------|
| N1  | Fast first load. | 2D board is interactive in < 1 s on a mid-range phone on 4G. Initial download ≤ 25 KB (compressed). |
| N2  | Keep game state separate from rendering. | The core module has no DOM or WebGL code. The compiler enforces this (see 5.2). |
| N3  | High performance. | 60 fps (or the display rate) during drag in 2D and 3D. No frame > 16 ms. |
| N4  | Repeat loads are instant. | Hashed files come from the browser cache. A service worker adds offline use. |

---

## 4. Technology choices

| Area | Choice | Reason |
|------|--------|--------|
| Language | TypeScript (strict) | Type safety. No runtime cost. |
| UI framework | **None** (plain DOM) | A framework adds 10–45 KB and a render loop. The board has 64 squares and few pieces. Direct DOM updates are faster and smaller. |
| Build tool | Vite | Fast builds. Code splitting with `import()`. Good tree shaking. |
| 2D render | DOM + inline SVG pieces, moved with CSS `transform` | The browser composites transforms on the GPU. No layout work during drag. Skins are easy with CSS variables. |
| 3D render | three.js (`WebGLRenderer`), **loaded only on demand** | Mature. Has the lathe, extrude, and shadow features we need. We load it only when the user opens the 3D view (or during idle time). The 2D view never pays for it. |
| 3D piece models | Generated in code (lathe + extrude geometry) | No model files to download. Total piece data is a few hundred bytes of profile points. |
| Tests | Vitest (core), Playwright (end-to-end) | Fast. Run locally. |
| Performance checks | Local scripts: bundle size check + Lighthouse | `npm run check` fails if a budget is exceeded. |

### 4.1 Options we rejected

- **React / Vue / Svelte**: not necessary. Extra bytes. Extra work per frame.
- **Canvas 2D for the 2D view**: fast, but skins and accessibility are harder. DOM with transforms is equally fast at this scale.
- **Raw WebGL or OGL for 3D**: smaller than three.js, but no lathe/extrude geometry and no shadows. We would write and maintain all of it.
- **Babylon.js**: larger than three.js.
- **GLTF model files for pieces**: extra network requests and bytes. Generated geometry is smaller.
- **Inline all JavaScript into the HTML** (single-file build): this also inlines the lazy 3D chunk, and the browser cannot cache the JavaScript. See 6.1.
- **`InstancedMesh` for 3D pieces**: not necessary for about 33 draw calls. It makes per-piece lift, highlight, add, and remove harder. See 6.3.

---

## 5. Architecture

The app has four layers. Each layer knows only the layer below it.

```
┌───────────────────────────────────────────────┐
│ app/   shell, toolbar, drawer, view switch    │
├──────────────────────┬────────────────────────┤
│ view2d/              │ view3d/  (lazy chunk)  │  ← renderers
│  + skins/2d/*        │  + skins/3d/*          │
├──────────────────────┴────────────────────────┤
│ interaction/   selection, drag state, intents │  ← shared input logic
├───────────────────────────────────────────────┤
│ core/          board state, commands, events  │  ← no DOM, no WebGL
└───────────────────────────────────────────────┘
```

### 5.1 Core (`src/core/`)

The core holds the board state. It is pure TypeScript.

- `squares`: an array of 64 cells. Each cell holds a piece ID or `null`.
- `pieces`: a map from piece ID to `{ type, color }`. The set is not fixed. Pieces are added and removed.
- `nextId`: a counter. Each new piece gets a new ID. IDs are never reused, so renderers always animate the correct piece.
- `offBoard`: piece IDs that were captured or removed. The UI does not show them. Undo needs them.
- `history`: an undo stack and a redo stack of applied commands.

Commands (the only way to change state):

- `move(pieceId, toSquare)` — applies the capture rule (2.1).
- `add(type, color, toSquare)` — makes a new piece from the drawer. Applies the capture rule.
- `remove(pieceId)` — takes a piece off the board.
- `reset()` — start position.
- `undo()` / `redo()` — step back or forward in the history.

Each command records the data necessary to reverse it.
For a move: from-square, to-square, and the captured piece ID (if any).
For an add: the new piece ID and the captured piece ID (if any).
For a remove: the piece ID and its square.
For a reset: a copy of the previous squares and piece map.

After each command, the core sends one `change` event with a small diff:
`{ moved: [...], added: [...], removed: [...], restored: [...] }`.
Renderers apply the diff. They do not redraw everything.
Undo produces the same kind of diff, so renderers need no special undo code.

The core does not know about orientation, selection, skins, the drawer UI, or views.
These are view state, not board state.

The core does not save state. A page reload starts a new board (F11).

### 5.2 How we enforce the separation

- `src/core/` has its own `tsconfig.json` with `"lib": ["ES2022"]`, no `"DOM"`, and `"types": []`.
  If core code uses `document` or `window`, the build fails.
- An ESLint rule (`no-restricted-imports`) stops `core/` from importing other layers.
- Core tests run in Node with no browser.

### 5.3 Interaction layer (`src/interaction/`)

This layer converts user intent into core commands. Both views and the drawer share it.

- Holds view state: selected piece, drag source (board square or drawer kind), hover square, orientation.
- Receives simple intents: `pickUp(square)`, `pickUpFromDrawer(kind)`, `hover(square | null)`, `drop(square | null)`, `cancel()`.
  `drop(null)` means "outside the board". For a board piece this is a remove. For a drawer piece it is a cancel.
- Calls the core.

A view has one hard job: convert a pointer position to a square, or to a piece.
In 2D this is simple math.
In 3D this has two parts (see 6.3):

- **Pick up:** test the ray against 32-ish simple hit cylinders, one for each piece. Tall pieces are hit at their head, not at the square behind them.
- **Hover and drop:** intersect the ray with the flat board plane.

### 5.4 View contract

Each view implements one interface:

```ts
interface BoardView {
  mount(el: HTMLElement, state: BoardState): void;
  unmount(): void;
  applyDiff(diff: BoardDiff): void;          // from core events
  setOrientation(o: 'white' | 'black'): void;
  setSkin(skin: Skin2D | Skin3D): void;
  setHighlight(state: InteractionState): void;
  squareAt(clientX: number, clientY: number): Square | null;  // for drawer drops
}
```

The drawer is outside the view. When the user drags from the drawer, the app asks the active view for `squareAt(x, y)`.
This is how one drawer works for 2D and 3D.

When the user changes view, the app unmounts the old view (or hides it, see 6.4) and mounts the new one with the current state.
The board state does not change.

### 5.5 Skins (`src/skins/`)

A skin is data, not code. Each skin is its own small chunk. The app loads a skin only when needed.

- **2D skin**: CSS custom properties (square colors, highlight colors, coordinates font) + one SVG sprite with 12 piece symbols.
- **3D skin**: board colors or a small texture, piece material values (color, roughness, metalness), light setup, background color. Optional: a different set of piece profiles (for a different piece style).

First skins:

- 2D: "Classic" — green/cream squares, clean vector pieces (our own drawings, so no license issue).
- 3D: "Wood & Ivory" — wood-tone board, light and dark pieces with a soft finish.

To add a skin: add one folder and one entry in the skin registry. No other code changes.

---

## 6. Performance plan

### 6.1 Load

1. Inline only the critical CSS and the default 2D piece sprite (SVG symbols, < 6 KB) into `index.html`.
2. Write the start position into `index.html` at build time. The board is visible before JavaScript runs.
3. Ship the app JavaScript (core + interaction + 2D + shell) as **one** hashed module file. Use `<link rel="modulepreload">` so the browser fetches it at once. The browser caches it for repeat visits.
4. Use no web fonts. Use system fonts.
5. Load three.js and the 3D view with `import()` only. Prefetch the chunk during idle time if the network is fast (`navigator.connection` check, `requestIdleCallback`).
6. Use hashed file names for all assets.
7. Add a small hand-written service worker for offline use. It is optional. If it causes update problems, remove it. Normal browser caching already makes repeat visits fast.

**Pre-render and 2D view use the same markup function.**
The build step and the 2D view both call one function, `renderBoardMarkup(state)`.
When the JavaScript starts, the 2D view adopts the existing elements. It does not rebuild them.
So there is no flash and no mismatch.

Budgets (compressed, checked by `npm run check`):

| Chunk | Budget |
|-------|--------|
| Initial (HTML + inline CSS/sprite + app JS) | ≤ 25 KB |
| 3D chunk (three.js + view3d) | ≤ 200 KB — measure early in M4 |
| Each skin | ≤ 10 KB (2D), ≤ 30 KB (3D) |

### 6.2 2D runtime

- Each piece is one absolutely positioned element. Move it with `transform: translate(...)`. Do not change `top`/`left`.
- Use `will-change: transform` only on the dragged piece.
- Use `setPointerCapture`. Update the drag position inside `requestAnimationFrame`. Do one write per frame.
- Do not read layout during drag. Read the board size once, and again only on `ResizeObserver` events.
- Apply core diffs to the changed pieces only.

### 6.3 3D runtime

- **Render on demand.** Do not run a continuous render loop. Render a frame only when the camera moves, a piece moves or animates, or the skin changes.
- **One mesh for each piece.** Share geometry (one for each piece type) and materials (one for each color). About 32 piece meshes + 1 board = about 33 draw calls. This is easy for a phone GPU. Add and remove are simple. Revisit only if profiling shows a problem.
- **Picking:** each piece has an invisible, simple hit cylinder. Pick-up ray casts test only these cylinders. Hover and drop use the flat board plane (one math operation).
- Use one light setup with a small shadow map. Update the shadow map only when a piece moves.
- Cap the pixel ratio at 2.
- Dispose all GPU resources on `unmount()`.

### 6.4 View switch

- 2D → 3D: show a short spinner only on the first switch if the chunk is not yet loaded.
- Keep the 3D renderer alive (hidden) after the first use, so the next switch is instant.
- Listen for `webglcontextlost`. Mobile browsers can drop the context of a hidden canvas. If this occurs, rebuild the 3D scene on the next switch.

### 6.5 Hosting (later)

Deployment is not in scope now. We test locally with `npm run dev` and `npm run preview`.
The target is Vercel as a static site. The build output already fits this (hashed `/assets/*` files).
When we deploy, we add `vercel.json` with cache headers.

---

## 7. Project structure

```
chess-board/
├─ index.html
├─ src/
│  ├─ core/            board.ts, commands.ts, history.ts, setup.ts, events.ts, types.ts, tsconfig.json
│  ├─ interaction/     controller.ts, keyboard.ts
│  ├─ view2d/          view2d.ts, markup.ts, view2d.css
│  ├─ view3d/          view3d.ts, geometry.ts, picking.ts, gestures.ts
│  ├─ skins/
│  │  ├─ registry.ts
│  │  ├─ 2d/classic/   skin.css, pieces.svg
│  │  └─ 3d/wood/      skin.ts
│  ├─ app/             main.ts, toolbar.ts, drawer.ts
│  └─ sw.ts            service worker (optional)
├─ scripts/
│  ├─ prerender.mjs    writes the start position into index.html
│  └─ check-size.mjs   fails if a budget is exceeded
├─ tests/
│  ├─ core/            Vitest unit tests
│  └─ e2e/             Playwright tests
├─ docs/plan-explainer.html
└─ PLAN.md
```

---

## 8. Milestones

| Step | Content | Done when |
|------|---------|-----------|
| M1 | Project setup: Vite, TypeScript strict, ESLint (with the core import rule), Vitest, Playwright, `npm run check` with size budgets. | `npm run check` passes on an empty app. |
| M2 | Core: state, move/add/remove/reset, capture rule, diff events, undo/redo history. Full unit tests. | 100% branch coverage on `core/`. |
| M3 | Interaction layer + 2D view + Classic skin + shared markup function + pre-render. Drag, click-click, keyboard, rotate, reset, small undo/redo controls, drawer. | User can move, add, and remove pieces. Initial bundle ≤ 25 KB. |
| M4 | 3D view (lazy) + Wood skin. Generated pieces, hit cylinders, gestures (2.5), rotate, drawer drops via `squareAt`. Measure the 3D chunk size first. | 60 fps drag on a mid-range phone. 3D chunk ≤ 200 KB. |
| M5 | View switch, context-loss recovery, skin registry, idle prefetch, service worker. | Local Lighthouse performance score ≥ 98 on mobile. |
| M6 | Polish: move, capture, and remove animations; accessibility checks; cross-browser tests. | Playwright passes on Chromium, Firefox, WebKit. |

---

## 9. Decisions log

| Date | Question | Decision |
|------|----------|----------|
| 2026-10-05 | What happens to a captured piece? | It moves off the board toward the drawer and disappears. Undo brings it back. |
| 2026-10-05 | Undo/redo? | Yes. Very small controls + keyboard shortcuts. |
| 2026-10-05 | Save position after reload? | No. |
| 2026-10-05 | Hosting? | Vercel (static), later. Local testing first. No CI for now. |
| 2026-10-05 | Pawn promotion and other manual changes? | Add a piece drawer with an unlimited supply. The user removes and adds pieces by hand. |
| 2026-10-05 | Review: inline JS? | No. Inline only critical CSS and the sprite. One cached JS module. |
| 2026-10-05 | Review: 3D picking? | Hit cylinders for pick-up. Board plane for hover and drop. |
| 2026-10-05 | Review: instancing? | No. One mesh for each piece, shared geometry and materials. |
| 2026-10-05 | Review: 3D drag vs orbit? | Rule in 2.5. |
| 2026-10-05 | Review: 3D size budget? | 200 KB. Measure early in M4. |
| 2026-10-05 | Review: pre-render mismatch? | One shared markup function. The 2D view adopts the elements. |
| 2026-10-05 | Review: WebGL context loss? | Listen for it. Rebuild on next switch. |

No questions are open.
