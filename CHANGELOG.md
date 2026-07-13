# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
