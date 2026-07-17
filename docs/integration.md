# Integration guide

The [README](../README.md) documents the API. This is the other half: what it
takes to put `<lit-isoflow>` into a real application — bundling, icons,
persistence, theming, and turning diagrams into documents.

Everything here comes from two working integrations (a demo host and an Electron
app that renders diagrams into PDFs and Word files), so the traps described are
ones that actually bit, not hypothetical ones.

- [Dropping it in](#dropping-it-in)
- [Icons: the 2.5 MB question](#icons-the-25-mb-question)
- [Saving and loading](#saving-and-loading)
- [Following your app's theme](#following-your-apps-theme)
- [Diagrams in documents (PDF, Word)](#diagrams-in-documents-pdf-word)
- [Frameworks](#frameworks)
- [Electron](#electron)
- [Real-time viewers](#real-time-viewers)

## Dropping it in

`<lit-isoflow>` is a custom element. Import it once, anywhere in your bundle, and
the tag works everywhere afterwards:

```js
import 'lit-isoflow';
```

It has **no intrinsic size** — it fills its container, like a `<canvas>` would.
A parent with no height renders a diagram zero pixels tall, which is the single
most common "nothing shows up" report:

```css
lit-isoflow {
  width: 100%;
  height: 600px; /* or inset: 0 inside a positioned parent */
}
```

The model is a **property, not an attribute** (it is an object, and attributes
are strings):

```js
diagram.model = myModel; // ✓
// <lit-isoflow model="..."> ✗ — never works
```

## Icons: the 2.5 MB question

Icons live in the model, as `{ id, name, url, isIsometric }`. The `url` is
normally a `data:` URI, so a model is self-contained: no asset server, no broken
images, and export pipelines work offline.

The official packs ([@isoflow/isopacks](https://github.com/markmanx/isoflow)) are
generous — around 1 060 icons across five collections (Isoflow, AWS, Azure, GCP,
Kubernetes) — and **that is roughly 2.5 MB of data URIs**. How you load them is
an architectural decision, not a detail.

**Do not import them into your main bundle.** With a bundler that inlines dynamic
imports (esbuild in IIFE format, for instance), even a lazy `import()` ends up in
the initial payload, and every user pays 2.5 MB to open an app that may never
show a diagram.

Load them on demand instead, from wherever your app fetches things:

```js
// Renderer side: ask the host for a pack, once, and cache it.
let iconsPromise;

const loadIcons = () => {
  iconsPromise ??= fetch('/api/isopacks/aws').then((r) => r.json());
  return iconsPromise;
};
```

In Electron, that "wherever" is the main process — see [Electron](#electron).

### Give the editor the whole catalogue

A saved model only needs the icons it uses, so it is tempting to filter on save
(and worth doing — it keeps files small). But then, when you reopen the model for
**editing**, the icon picker must still offer everything:

```js
// The file's own icons win (a model may ship a custom icon), then the catalogue.
const fileIcons = new Map(model.icons.map((i) => [i.id, i]));
model.icons = [...catalogue.filter((i) => !fileIcons.has(i.id)), ...model.icons];
```

Skip this and picking a new icon assigns an id that is not in the model, so the
node renders **with no icon at all** — a silent, confusing failure.

## Saving and loading

The component never mutates the model you hand it: it works on an internal copy.
Two things to wire.

**`model-updated`** fires (debounced) after any edit. Use it to mark your document
dirty — not to save on every keystroke:

```js
diagram.addEventListener('model-updated', () => {
  markDirty(true);
});
```

**`getModel()`** returns a deep snapshot of the current state. That is what you
write to disk:

```js
const save = async () => {
  const model = diagram.getModel();

  // Optional: keep only the icons this diagram uses (see the caveat above).
  const used = new Set(model.items.map((i) => i.icon).filter(Boolean));
  model.icons = model.icons.filter((icon) => used.has(icon.id));

  await writeFile(path, JSON.stringify(model, null, 2));
  markDirty(false);
};
```

The format is plain JSON, interchangeable with Isoflow/FossFLOW. Validate it with
the exported schema if it comes from anywhere you do not control:

```js
import { modelSchema } from 'lit-isoflow';

const result = modelSchema.safeParse(JSON.parse(file));
if (!result.success) showError(result.error.issues);
```

The component validates on its own too: a bad model never throws, it paints the
error on the canvas and fires `model-error` with the zod issues. Listening to
that is enough if you just want to surface it in your own UI — validate up front
only when you need to reject a file _before_ handing it over.

## Following your app's theme

The `theme` property defaults to `auto`, which follows the **operating system**
(`prefers-color-scheme`). That is the right default for a standalone page, and
the wrong one for an app with its own light/dark switch: the diagram would stay
light while your UI goes dark.

If your app owns a theme, drive the property explicitly:

```js
const currentTheme = () =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

diagram.theme = currentTheme();

// And keep following it.
new MutationObserver(() => {
  diagram.theme = currentTheme();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
```

The theme only repaints the **chrome** (background, grid, label boxes, leader
lines). Node, connector and zone colours come from `model.colors`: they belong to
the diagram, not the interface, and a flow marked red still means red at night.

## Diagrams in documents (PDF, Word)

`lit-isoflow/render` renders a model to SVG in **pure JavaScript, with no DOM**.
It is the same geometry engine the component uses, so what you export is what the
editor showed — and it runs in a CLI, a build step, or a server, with no browser
and no Electron:

```js
import { renderToSvg } from 'lit-isoflow/render'; // no lit, no DOM

const { svg, width, height } = renderToSvg(model, {
  theme: 'light', // an export is a document, not a screen: default is light
  margin: 0.15 // tiles of padding around the content
});
```

### The trap that eats your icons

Some SVG consumers — **pdfmake among them** — cannot decode a nested
`<image href="data:image/svg+xml,…">`. They do not error: they simply draw
nothing, and your infrastructure diagram arrives in the PDF with every icon
missing.

That is why `renderToSvg` **inlines icons as `<symbol>` / `<use>` by default**
rather than referencing them. Keep it that way unless you know your consumer
handles nested data URIs (`inlineIcons: false` restores the old behaviour). As a
bonus, one `<symbol>` per icon instead of one `<image>` per node made a real
diagram shrink from 45 kB to 27 kB.

### Sizing it on the page

Give your PDF library **one** dimension and let it scale, or pass a `fit` box.
Setting both width and height independently is how aspect ratios get crushed:

```js
// pdfmake
{ svg, fit: [contentWidth, contentHeight] }  // ✓ keeps the ratio
{ svg, width: 400, height: 300 }             // ✗ distorts
```

### Word, and other formats that refuse SVG

DOCX will not take SVG. Rasterise it — in Electron, an offscreen `BrowserWindow`
does the job; in Node, a library like `sharp` or `resvg`:

```js
const { svg, width, height } = renderToSvg(model);
const png = await rasterise(svg, { width: width * 2, height: height * 2 }); // 2× for print
```

### Legibility is the real constraint

An isometric diagram is about 1.5× wider than tall, so **width** is what forces
the scale down, and node labels are what become unreadable. Measured on A4
portrait: four nodes in a row are fine, five are not, and **six in a 3 × 2 grid
are fine**. A grid costs far less width than a row. If you generate diagrams
programmatically, check the resulting label size before shipping the document —
below roughly 6 pt nobody can read them.

## Frameworks

It is a standard custom element, so it works anywhere. The only recurring
friction is that **properties are not attributes**:

```jsx
// React ≤ 18: set object properties through a ref, not JSX props.
const ref = useRef(null);
useEffect(() => {
  ref.current.model = model;
}, [model]);
return <lit-isoflow ref={ref} editor-mode="EDITABLE" />;
// React 19 sets properties on custom elements directly — <lit-isoflow model={model} /> works.
```

```html
<!-- Vue: .prop modifier -->
<lit-isoflow :model.prop="model" editor-mode="EDITABLE" />

<!-- Svelte: properties are set directly -->
<lit-isoflow bind:this="{el}" editor-mode="EDITABLE" />
```

Add `lit-isoflow` to your framework's list of custom elements if it warns about
unknown tags (`compilerOptions.isCustomElement` in Vue, for instance).

## Electron

Two things to get right.

**Load icon packs in the main process, not the renderer.** The renderer bundle
would otherwise carry 2.5 MB of data URIs. Expose them over IPC, cache them on
the main side, and let every window share one copy:

```js
// main
let packs;
ipcMain.handle('isoflow:icons', async (_e, name) => {
  packs ??= new Map();
  packs.get(name) ?? packs.set(name, await import(`@isoflow/isopacks/dist/${name}`));
  return packs.get(name).default.icons;
});
```

**Remember that the main process caches modules.** If you render diagrams to SVG
in the main process (for a PDF preview, say), both the `lit-isoflow/render` module
and any SVG cache of your own survive a renderer reload. Rebuilding the front-end
bundle will **not** pick up a new version of the component — the app has to be
restarted. This looks exactly like "my changes did nothing", and it costs an hour
the first time.

## Real-time viewers

If your app drives the diagram live — agent states changing, a request
travelling an edge — two things keep it smooth.

**Patch, don't replace.** Reassigning `model` re-ingests the whole document.
For a running scene, mutate in place instead: `updateConnector(id, updates)`,
`updateItem(id, updates)`, `updateViewItem`, `updateRectangle`. These keep the
camera (no re-fit), and only the elements that actually changed re-render — the
rest is memoised by object identity, so a scene of a few nodes or a few
thousand costs the same per update.

**Signal flow with `pulse()`.** To show a message travelling a connector, play
a one-shot flow animation rather than toggling styles by hand:

```js
diagram.pulse(connectorId, { durationMs: 1400, glow: true });
// or a coloured flow: diagram.pulse(id, { color: '#22d3ee', glow: true });
```

Dashes scroll along the connector from→to for `durationMs`, then it clears
itself. It is **runtime, not model**: it fires no `model-updated`, adds no undo
entry, and the headless renderer ignores it — a pulse is an interaction, not a
document, so it never leaks into an exported SVG or PDF. The animation is pure
CSS and stills under `prefers-reduced-motion`. `glow` adds a soft halo that
reads best on the dark theme.
