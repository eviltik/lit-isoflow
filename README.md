# lit-isoflow

Isometric infrastructure diagrams as a **Lit web component** — a React-free port of
[Isoflow](https://github.com/markmanx/isoflow) / FossFLOW.

The model format (JSON) is interchangeable with Isoflow/FossFLOW exports: diagrams
created there render here, and vice versa.

> **Status: phase 1 — read-only renderer.**
> Grid, nodes (isometric & flat icons), connectors (A* routing, solid/dashed/dotted,
> direction arrows, labels), rectangles, text boxes, node labels, pan & zoom,
> fit-to-view. Editing is planned (phase 2).

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
| `editorMode`      | `editor-mode`      | `EXPLORABLE_READONLY`    | `EXPLORABLE_READONLY` (pan/zoom) or `NON_INTERACTIVE` |
| `showGrid`        | `show-grid`        | `true`                   | Show the isometric grid                            |
| `backgroundColor` | `background-color` | `#f6faff`                | Diagram background                                 |
| `fitToView`       | `fit-to-view`      | `false`                  | Fit the view in the viewport on load               |

### Methods

- `zoomIn()` / `zoomOut()` — same zoom steps as Isoflow (0.2 → 1.0)
- `fit()` — fit the whole view inside the viewport

### Events

- `diagram-ready` — model parsed and scene rendered
- `zoom-changed` — `detail.zoom`
- `model-error` — `detail.error` (zod validation error)

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

## License

MIT — portions derived from [Isoflow](https://github.com/markmanx/isoflow) (MIT)
and FossFLOW (MIT).
