# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`pulse(connectorId, { durationMs?, color?, glow? })`** (#13). Plays a
  one-shot flow animation along a connector: dashes scroll from→to for
  `durationMs` (default 1400), then the pulse clears itself. Built for
  real-time viewers signalling a message travelling an edge — an agent
  streaming, a request in flight. Deliberately **runtime, not model**: it
  fires no `model-updated`, adds no undo entry, and the headless renderer
  ignores it, because a pulse is an interaction, not a document (an export is
  static). The scroll direction follows the connector's own from→to whichever
  way it was drawn, so the flow chases the direction arrow. `color?` overrides
  the flow colour (default: the connector's); `glow?` adds a soft halo, which
  reads best on the dark theme. The animation is pure CSS
  (`stroke-dashoffset`) — no per-frame JS, and it stills under
  `prefers-reduced-motion`. Calling it again on the same connector restarts
  it. Hosts driving frequent state changes should reach for the existing
  `updateConnector`/`updateItem` mutations rather than replacing the whole
  `model`: they patch in place, keep the camera (no re-fit), and only re-render
  what changed.

## [1.1.0] — 2026-07-16

### Fixed

- **An element buried under another can now be reached** (#3). Clicking the
  selected element again descends the tile's stack — icon, then each connector
  crossing the tile, then the zone below, wrapping at the bottom. Dragging
  never advances the cycle: pressing a tile whose stack contains the current
  selection grabs the selection, so once the zone is reached, dragging moves
  the zone even though an icon sits on top. No cycle state to reset — the
  depth is wherever the previous selection sits in the clicked tile's stack.
- **Labels can no longer hide behind icons** (#2). Two causes, one per label
  kind: connector labels were painted before the nodes layer, and node labels
  lived inside the node layer where the isometric painter's order let a
  foreground icon cover the label of a node behind. All labels — node and
  connector — now paint in their own layer above every icon, in both the
  component and the headless SVG renderer, so an exported PDF matches the
  editor. Side effect, assumed: a leader line's dotted foot now paints over
  its icon instead of being covered by it.

### Changed

- **The selection band is a screen-aligned rectangle** (#7), not the isometric
  parallelogram: it is what every tool trains the hand to expect. Capture
  follows the eye — an element is selected when it falls inside the rectangle
  on screen (nodes and text boxes by their projected tile centre, a zone when
  its four projected corners are all inside).

### Added

- **Additive selection with Shift** (#5). Shift+click adds an element to the
  selection, or removes it when already there — the toggle is what lets a
  selection be corrected instead of rebuilt. Shift+rubber-band merges the
  band's capture into the existing selection instead of replacing it, and a
  single-click selection is promoted to a group so it can grow. Works whatever
  built the current selection.

### Changed

- **Transient pan moves from Shift to Ctrl** (Space unchanged). Shift is the
  universal add-to-selection modifier and cannot double as pan.

- **Rubber-band selection** (#1). Dragging on empty canvas with the cursor tool
  draws a selection band, in tile space — the projected parallelogram you see is
  exactly what is captured. Nodes and text boxes are caught by their anchor
  tile; a zone only when fully contained (half-crossed is brushed against, not
  aimed at). Dragging any member then moves the whole set, as one undo gesture;
  a plain click on a member collapses the group to that single element; Escape
  clears; Delete removes every member. New API: `getSelectedItems()` and the
  `selection-changed` event. Connectors anchored to captured nodes follow them
  by construction.

## [1.0.0] — 2026-07-13

First release on npm. The API is unchanged in shape since 0.1.0 — it has been
proven by two real integrations — and is now documented well enough to commit to:
see the [integration guide](docs/integration.md).

### Added

- **Light / dark theme.** New `theme` property: `light`, `dark`, or `auto`
  (default, follows the OS and repaints when it changes). The theme repaints the
  chrome only — background, grid, label boxes, leader lines, connector halos.
  Node, connector and zone colours come from `model.colors`: they belong to the
  diagram, not the interface. The headless renderer takes a `theme` option too,
  and defaults to `light`, because an export is a document and must not depend on
  the machine that generated it.
- **`createRectangle({ from, to, color?, id? })` / `deleteRectangle(id)`.** Zones
  could previously only be drawn with the mouse, which left a host no way to
  place one programmatically (importing, templating, generating).
- **Integration guide** ([docs/integration.md](docs/integration.md)): bundling,
  icon packs, saving, theming, and rendering diagrams into PDFs and Word files.
- **Stress demo**: generates up to 10 000 nodes and reports first render, DOM
  size and frame rate. The demo page is now an index over two demos.

### Changed

- **Zoom floor lowered from 0.2 to 0.01.** `fit()` could not frame a large
  diagram: 10 000 nodes need about 0.05 and stayed clipped at 0.2.
- **`backgroundColor` now overrides the theme's background** instead of forcing a
  light one. Unset (the default), the background follows the theme. If you
  relied on the previous `#f6faff` default, set it explicitly.

### Performance

Interaction is now **independent of model size**. At the working zoom, 1 000 and
10 000 nodes both hold ~60 fps while panning and under live mutation (~3 000 icon
swaps per second); it used to be 20 fps and 17 fps respectively, degrading as the
model grew.

- Off-screen nodes are no longer mounted.
- A node's template is rebuilt only when that node changed — its rendering
  depends on exactly four things (view item, model item, resolved icon, theme),
  and mutations replace those objects rather than editing them in place, so
  identity is a sound change signal.

The remaining limit, stated plainly: zooming out to fit a huge diagram puts every
node on screen, so every node is mounted, and reconciling 10 000 live DOM subtrees
costs ~120 ms per frame — around 2 fps. Level-of-detail rendering is the answer to
that, and it is not in this release.

### Fixed

- Selecting an icon that the model did not already carry left the node with no
  icon at all. The editor is now handed the full catalogue, with the model's own
  icons taking priority.
- `fit()` measured the tile bounding box, which overestimates by roughly 3×, and
  left diagrams tiny; it now measures what is actually painted.

## [0.1.0] — 2026-07-13

First public release: a React-free port of
[Isoflow](https://github.com/markmanx/isoflow) / FossFLOW as a Lit web component.

### Added

**Viewer**

- `<lit-isoflow>` renders Isoflow/FossFLOW-compatible JSON models: isometric grid,
  nodes (isometric & flat icons), connectors (A\* routing, solid/dashed/dotted,
  direction arrows, labels), rectangles, text boxes, node labels
- Pan, zoom (`zoomIn()` / `zoomOut()`), `fit()` / `fit-to-view`
- Three modes via `editor-mode`: `EXPLORABLE_READONLY` (default), `EDITABLE`,
  `NON_INTERACTIVE`

**Editor** (`editor-mode="EDITABLE"`)

- Tools via `setTool()`: select, pan, place icon, connector, rectangle, text box
- Select & drag items, connectors re-route live
- Draw connectors anchored to items or tiles; re-anchor or bend them by dragging
  their anchors and path
- Draw and resize rectangles with transform anchors
- Gesture-level undo/redo (`undo()` / `redo()`, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
- Transient pan while holding Shift or Space
- Delete the selection (Delete key or `deleteSelection()`)
- Property API for host-provided panels: `getSelectedItem()`, `updateItem()`,
  `updateViewItem()`, `updateConnector()`, `updateRectangle()`, `updateTextBox()`
- Events: `diagram-ready`, `zoom-changed`, `model-error`, `item-selected`,
  `model-updated`, `tool-changed`, `history-changed`

**Export**

- `exportPng()` — dependency-free PNG rendering (off-screen clone → SVG
  `foreignObject` → canvas), cropped tightly to the rendered content, with
  transparent-background support
- `getModel()` — JSON snapshot, interchangeable with Isoflow/FossFLOW

**Demo**

- Full editor UI (floating toolbar, property panel, searchable icon gallery over
  all five `@isoflow/isopacks`, Editor/Viewer switch, PNG & JSON export)

### Deviations from upstream Isoflow

- No React, MUI, zustand, immer, gsap or chroma-js: Lit templates, pure-function
  scene derivation, CSS transitions, HSL colour variants
- Selected-connector anchors render above the nodes layer and take hit-test
  priority, so endpoints sitting on a node can be grabbed and re-anchored
- Gesture-level undo/redo (absent upstream)
- PNG export without `dom-to-image`
- Invalid connectors are skipped rather than deleted from the model
- The Lasso mode is not ported (it is commented out upstream)
