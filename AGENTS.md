# Working on lit-isoflow — agent guide

You are in a Lit web component: a viewer/editor for isometric infrastructure
diagrams, React-free port of Isoflow/FossFLOW, published on npm. Plain ES
modules with JSDoc — **there is no build step**; what is in `src/` is what
ships.

Pick your document:

- **Embedding the component in an app** → [docs/integration.md](docs/integration.md)
  (bundling, icon packs, saving, theming, PDF/Word export). Do not re-derive
  what it already covers.
- **Changing the component itself** → this file.
- API surface → [README.md](README.md). History and intent behind past
  changes → [CHANGELOG.md](CHANGELOG.md), which is unusually explanatory.

## The map, and the one rule that matters most

```
src/
  lit-isoflow.js        the component: DOM rendering, layers, interaction loop
  render-svg.js         HEADLESS renderer: pure JS → SVG string, no DOM at all
  scene.js              deriveScene(): model → scene (pure), shared by both
  utils/renderer.js     geometry: projections, hit-testing, paths — shared, pure
  config.js             tile geometry constants, zoom bounds — shared
  theme.js              light/dark palettes — shared
  schemas.js            zod model schema (interchangeable with Isoflow JSON)
  editor/modes.js       interaction state machines (cursor, lasso, drag, …)
  editor/mutations.js   in-place model mutations
```

**Two renderers, one geometry.** `lit-isoflow.js` (DOM) and `render-svg.js`
(headless) must produce the same picture; they share `scene.js`,
`utils/renderer.js`, `config.js`, `theme.js`. Consequences:

- A visual change (layer order, label placement, colours) must land in
  **both** renderers, or exported documents stop matching the editor.
- **Never put viewport-dependent logic in the shared files.** The headless
  renderer runs where there is no viewport (Node, CLIs, PDF pipelines):
  viewport culling in `scene.js` would export empty diagrams. Culling lives in
  `lit-isoflow.js` only, and that is deliberate.
- New geometry helpers go in `utils/renderer.js` **only if pure** (see
  `tileToScreen`/`screenToIso`, which are exact inverses, locked by a
  round-trip test).

## Invariants — each one broke something once

1. **Tile geometry constants never change.** `UNPROJECTED_TILE_SIZE = 100`,
   `PROJECTED_TILE_SIZE ≈ {141.5, 81.9}` (`config.js`): model coordinates in
   the wild depend on them.
2. **Mutations replace objects, never edit them in place**
   (`{ ...item, ...updates }` in `editor/mutations.js`). The render
   memoisation (`guard()` in the node layer) uses object identity as its
   change signal; an in-place edit renders stale nodes with no error.
3. **A node's template depends on exactly four things**: view item, model
   item, resolved icon, theme. Adding a fifth dependency inside
   `_renderNode`/`_renderNodeLabel` without adding it to the `guard()` array
   silently freezes that aspect. This contract is what keeps interaction
   independent of model size (~60 fps at 10 000 nodes).
4. **Element colours belong to the diagram, not the interface.** The theme
   repaints chrome only (background, grid, labels, halos); node/connector/zone
   colours come from `model.colors`. Do not theme them.
5. **Headless export defaults to `theme: 'light'`** — an export is a
   document, not a screen; it must not depend on the generating machine.
6. **Icons are inlined as `<symbol>`/`<use>` in SVG output.** pdfmake cannot
   decode nested `<image href="data:…">` and draws _nothing_, silently.
7. **Layer order** (component and SVG alike): rectangles < grid < cursor
   < connectors < textBoxes < nodes < connectorLabels < nodeLabels
   < controls. Labels sit **above all icons** on purpose (a label's only job
   is to be readable); within a layer, isometric painter's order (high x+y
   first — SVG by document order, DOM by z-index).
8. **The selection band is a screen-aligned rectangle**; capture is computed
   in screen space via `tileToScreen`. Do not "simplify" it back to tile
   bounds — that was the original design and users found it alien.
9. **The zoom floor (0.01) is that low on purpose** — thousands of nodes only
   fit on screen at a few percent. `fit()` measures painted content
   (`getContentBox`), not the tile bounding box (~3× overestimate).
10. **The component never mutates the model you hand it** (works on a
    `structuredClone`), and a bad model never throws — it paints the error
    and fires `model-error`.

## How interaction works

`editor/modes.js` holds per-mode state machines (`entry`/`exit`/`mousemove`/
`mousedown`/`mouseup`) receiving `{ uiState, scene, isRendererInteraction }`.
Things that bite:

- **A mode change made by a handler takes effect on the _next_ event.**
  `_handleMouseEvent` resolves the handler before running it. A drag therefore
  needs two mousemoves before mutations flow.
- `isRendererInteraction` is true only when the event's `composedPath()`
  includes the component. `mousedown`/`mouseup` in Cursor mode require it.
- `uiState` is a facade (`_uiStateFacade()` in the component): modes read
  `mode/mouse/scroll/itemControls/selection/shiftHeld/viewport` and write
  through `actions.*` only. Extend the facade rather than reaching into the
  component.
- Selection semantics worth knowing before touching them: nothing is decided
  at mousedown (press may become a drag); a plain click on the selected
  element cycles down the tile's stack (`getItemsAtTile`), and pressing a
  tile whose stack contains the current selection grabs _the selection_ (that
  is what lets a zone under an icon be dragged). `DRAG_ITEMS` takes an array.
- Undo/redo is gesture-level: `_beforeMutation` snapshots once per gesture
  (`_historyOpen`), closed on mouseup — N mutations in one drag are one undo.

## Testing

- `pnpm run check` = eslint + **prettier check** + `node --test`. Run it
  unfiltered before pushing: CI fails on formatting alone, and piping through
  grep has masked exactly that failure before.
- `node --test` bare — no globs, no directory argument (not portable; CI is
  Node 22).
- Unit tests target the pure layers (`geometry`, `scene`, `render-svg`,
  exported helpers from `modes.js`). The component itself is exercised
  end-to-end.
- **E2E**: build the demo (`vite build demo`), drive it in an offscreen
  Electron `BrowserWindow`, dispatch real events. Hard-won rules:
  - Aim at tiles **closed-loop**: `screenToIso` floors, so probe the affine
    basis over a large span, then correct against
    `component._mouse.position.tile` until it matches.
  - Dispatch mouse events **on the component** (`bubbles: true, composed:
true`), not on `window` — `isRendererInteraction` fails otherwise.
  - Two mousemoves minimum for a drag (mode-change lag above).
  - Labels and layers are `pointer-events: none`: `elementsFromPoint` cannot
    prove stacking — compare DOM layer order (`compareDocumentPosition`).
  - The screenshot is evidence: capture and _look at it_; counters alone have
    lied (a "working" feature selecting via the wrong geometry).

## Workflow

- One branch per issue, PR titled for the change, body explains _why_, ends
  with `Closes #N`. CI green, then **the maintainer tests the demos by hand
  before merging** — do not merge on your own initiative.
- `CHANGELOG.md` under `[Unreleased]`, in the same explanatory register as
  the existing entries (what, why, the trade-offs assumed).
- Demo texts are i18n'd in `demo/shared/i18n.js` — **both** `en` and `fr`,
  plus the hint bar in `demo/editor/index.html` and the README keyboard
  table, whenever bindings change.
- Build artifacts (`dist-demo/`, `dist-test/`) are gitignored; a `git add -A`
  once committed one — check `git status` before staging.
- Releases: bump with `npm version`, date the CHANGELOG, tag `vX.Y.Z`,
  `npm publish` (2FA — only the maintainer can). The package ships `src/`
  only.
