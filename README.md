# lit-isoflow

Isometric infrastructure diagrams as a **Lit web component** — a React-free port of
[Isoflow](https://github.com/markmanx/isoflow) / FossFLOW.

The model format (JSON) is interchangeable with Isoflow/FossFLOW exports: diagrams
created there render here, and vice versa.

> **Status: phase 2 — renderer + editing.**
> Rendering: grid, nodes (isometric & flat icons), connectors (A* routing,
> solid/dashed/dotted, direction arrows, labels), rectangles, text boxes, node
> labels, pan & zoom, fit-to-view.
> Editing (`editor-mode="EDITABLE"`): select & drag items, draw connectors
> (anchored to items or tiles), re-anchor or bend connectors by dragging their
> anchors/path, draw & resize rectangles, place icons, add text boxes, delete
> selection, undo/redo. Item property panels (name, color, description…) are
> up to the host app for now (phase 3).

## Install

```bash
npm install lit-isoflow
```

## Usage

```html
<lit-isoflow fit-to-view style="width: 100%; height: 600px"></lit-isoflow>

<script type="module">
  import 'lit-isoflow';

  const diagram = document.querySelector('lit-isoflow');
  diagram.model = {
    title: 'My diagram',
    icons: [{ id: 'server', name: 'Server', url: '...', isIsometric: true }],
    colors: [{ id: 'blue', value: '#a5b8f3' }],
    items: [{ id: 'srv1', name: 'Server 1', icon: 'server' }],
    views: [
      {
        id: 'main',
        name: 'Main view',
        items: [{ id: 'srv1', tile: { x: 0, y: 0 } }],
        connectors: [],
        rectangles: [],
        textBoxes: []
      }
    ]
  };
</script>
```

### Properties / attributes

| Property          | Attribute          | Default                  | Description                                        |
| ----------------- | ------------------ | ------------------------ | -------------------------------------------------- |
| `model`           | —                  | `null`                   | Diagram model (Isoflow/FossFLOW JSON)              |
| `viewId`          | `view-id`          | first view               | View to display                                    |
| `editorMode`      | `editor-mode`      | `EXPLORABLE_READONLY`    | `EDITABLE`, `EXPLORABLE_READONLY` (pan/zoom) or `NON_INTERACTIVE` |
| `showGrid`        | `show-grid`        | `true`                   | Show the isometric grid                            |
| `backgroundColor` | `background-color` | `#f6faff`                | Diagram background                                 |
| `fitToView`       | `fit-to-view`      | `false`                  | Fit the view in the viewport on load               |

### Methods

- `zoomIn()` / `zoomOut()` — same zoom steps as Isoflow (0.2 → 1.0)
- `fit()` — fit the whole view inside the viewport
- `setTool(tool, options?)` — activate an editing tool: `'CURSOR'`, `'PAN'`,
  `'PLACE_ICON'` (`options.iconId`), `'CONNECTOR'`, `'RECTANGLE'`, `'TEXTBOX'`
- `tool` (getter) — currently active tool
- `deleteSelection()` — delete the selected item (also bound to the Delete key)
- `undo()` / `redo()` — gesture-level history (also bound to Ctrl+Z / Ctrl+Y /
  Ctrl+Shift+Z); `canUndo` / `canRedo` getters
- `getModel()` — deep snapshot of the current (possibly edited) model

### Events

- `diagram-ready` — model parsed and scene rendered
- `zoom-changed` — `detail.zoom`
- `model-error` — `detail.error` (zod validation error)
- `item-selected` — `detail.item` (`{ type, id }` or `null`)
- `model-updated` — `detail.model` (debounced snapshot after each edit)
- `tool-changed` — `detail.tool`
- `history-changed` — `detail.canUndo` / `detail.canRedo`

### Icons

Icons are plain image URLs (SVG/PNG, data URIs welcome), declared in `model.icons`.
`isIsometric: true` renders the image as-is (pre-projected isometric artwork);
`isIsometric: false` projects a flat image onto the isometric ground plane.
Isoflow isopack icons work unchanged.

> Note: node `description` fields contain HTML (rich text in Isoflow) and are
> rendered as-is. Only feed models from trusted sources.

## Demo

```bash
npm install
npm run demo
```

## Design notes / deviations from Isoflow

- No React, MUI, zustand, immer, gsap or chroma-js. The geometry engine
  (projection, A* connector routing, fit-to-view) is ported as-is; the view
  layer is rewritten with Lit templates, animations use CSS transitions and
  color variants use an HSL approximation of chroma's brighten/darken.
- The scene (connector paths, textbox sizes) is derived from the model as a
  pure function (`deriveScene`) instead of being kept in sync in a store.
- Invalid connectors are skipped instead of deleted from the model.
- Selected-connector anchors render above the nodes layer and take hit-test
  priority, so endpoints sitting on a node can be grabbed and re-anchored
  (upstream hides them behind nodes and always drags the node).
- Gesture-level undo/redo (snapshot per mouse gesture, 50 steps) — absent
  upstream.

## License

MIT — portions derived from [Isoflow](https://github.com/markmanx/isoflow) (MIT)
and FossFLOW (MIT).
