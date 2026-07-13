# lit-isoflow

**Viewer and editor for isometric infrastructure diagrams**, as a single Lit
web component — a React-free port of
[Isoflow](https://github.com/markmanx/isoflow) / FossFLOW.

The model format (JSON) is interchangeable with Isoflow/FossFLOW exports: diagrams
created there render here, and vice versa.

## One component, three modes

The `editor-mode` attribute selects what `<lit-isoflow>` is:

| Mode                        | What you get | Typical use |
| --------------------------- | ------------ | ----------- |
| `EXPLORABLE_READONLY` *(default)* | **Viewer** — pan, zoom, fit-to-view; the model is never mutated | embedding a diagram in docs, dashboards, read-only apps |
| `EDITABLE`                  | **Editor** — everything below: tools, selection, drag, drawing, undo/redo, property API | diagram authoring UI |
| `NON_INTERACTIVE`           | **Static rendering** — no listeners at all | screenshots, PDF/PNG export pipelines, thumbnails |

```html
<!-- Viewer -->
<lit-isoflow fit-to-view></lit-isoflow>

<!-- Editor -->
<lit-isoflow editor-mode="EDITABLE" fit-to-view></lit-isoflow>
```

Editing capabilities (`EDITABLE`): select & drag items, draw connectors
(anchored to items or tiles), re-anchor or bend connectors by dragging their
anchors/path, draw & resize rectangles, place icons, add text boxes, delete
selection, gesture-level undo/redo, transient pan (hold Shift/Space).
Property panels (name, color, description…) are provided by the host app —
see “Wiring a property panel”.

Rendering (all modes): grid, nodes (isometric & flat icons), connectors
(A* routing, solid/dashed/dotted, direction arrows, labels), rectangles,
text boxes, node labels.

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

Keyboard (EDITABLE): Delete removes the selection, Ctrl+Z / Ctrl+Y undo/redo,
and holding **Shift** or **Space** pans temporarily — the active tool and
selection are restored on release.
- `getModel()` — deep snapshot of the current (possibly edited) model
- `getSelectedItem()` / `updateItem()` / `updateViewItem()` / `updateConnector()`
  / `updateRectangle()` / `updateTextBox()` — property-panel API, see
  “Wiring a property panel” below

### Events

- `diagram-ready` — model parsed and scene rendered
- `zoom-changed` — `detail.zoom`
- `model-error` — `detail.error` (zod validation error)
- `item-selected` — `detail.item` (`{ type, id }` or `null`)
- `model-updated` — `detail.model` (debounced snapshot after each edit)
- `tool-changed` — `detail.tool`
- `history-changed` — `detail.canUndo` / `detail.canRedo`

### Wiring a property panel / rich text editor

`<lit-isoflow>` deliberately ships **no property panel and no rich text
editor**: the canvas stays lean (lit + zod + pathfinding) and the host app
brings its own UI kit. The wiring contract is three parts:

1. **Listen to `item-selected`**, then call `getSelectedItem()` for the full
   data of the selection:

   ```js
   diagram.addEventListener('item-selected', () => {
     const selected = diagram.getSelectedItem();
     // ITEM      → { type, id, modelItem: { name, description, icon }, viewItem: { tile, labelHeight } }
     // CONNECTOR → { type, id, connector: { description, color, style, width, anchors } }
     // RECTANGLE → { type, id, rectangle: { color, from, to } }
     // TEXTBOX   → { type, id, textBox: { content, fontSize, orientation, tile } }
     renderMyPanel(selected); // null when the selection is cleared
   });
   ```

2. **Write changes back** through the update methods — each call re-renders
   the scene, feeds the undo history and emits `model-updated`:

   ```js
   diagram.updateItem(id, { name, description, icon });
   diagram.updateViewItem(id, { tile, labelHeight });
   diagram.updateConnector(id, { description, color, style, width });
   diagram.updateRectangle(id, { color });
   diagram.updateTextBox(id, { content, fontSize, orientation });
   ```

3. **Persist** by listening to `model-updated` (debounced) or calling
   `getModel()` whenever you save.

The demo ([demo/index.html](demo/index.html)) implements a complete panel with
plain HTML inputs — no dependency — and is the reference example.

**Rich descriptions:** `modelItem.description` is an **HTML string**
(≤ 1000 chars; upstream Isoflow edits it with Quill and uses `<p><br></p>` as
its empty value). Any editor that produces HTML plugs in. With tiptap:

```js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

let editor;
diagram.addEventListener('item-selected', () => {
  const selected = diagram.getSelectedItem();
  editor?.destroy();
  if (selected?.type !== 'ITEM') return;

  editor = new Editor({
    element: document.querySelector('#description-editor'),
    extensions: [StarterKit],
    content: selected.modelItem.description ?? '',
    onUpdate: ({ editor }) => {
      diagram.updateItem(selected.id, { description: editor.getHTML() });
    }
  });
});
```

Notes:
- Each keystroke burst (pauses < 250 ms) collapses into one undo step; debounce
  `onUpdate` yourself if you want coarser steps.
- Descriptions are rendered as-is in node labels — sanitize if models come from
  untrusted sources.

### Icons

Icons are plain image URLs (SVG/PNG, data URIs welcome), declared in `model.icons`.
`isIsometric: true` renders the image as-is (pre-projected isometric artwork);
`isIsometric: false` projects a flat image onto the isometric ground plane.

The official icon packs work unchanged — the demo loads all five
[@isoflow/isopacks](https://www.npmjs.com/package/@isoflow/isopacks)
(Isoflow basic, AWS, Azure, GCP, Kubernetes — 1000+ icons) and exposes them in
a searchable gallery:

```js
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';

const icons = isoflowIsopack.icons.map((icon) => ({ ...icon, collection: 'Isoflow' }));
diagram.model = { ...model, icons };
```

Icon artwork belongs to its respective owners (AWS, Microsoft, Google, CNCF,
Isoflow); check the isopacks repository for per-collection licences. That is
why `@isoflow/isopacks` is a dev-dependency of the demo, not a dependency of
this package.

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
