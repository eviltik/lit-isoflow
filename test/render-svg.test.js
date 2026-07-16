import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderToSvg } from '../src/render-svg.js';

// A square isometric icon as a data URI, so the renderer can read its viewBox
// exactly as it would with an isopack icon.
const iconUrl = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 115"><rect width="100" height="115"/></svg>'
)}`;

const makeModel = () => {
  return {
    title: 'Test',
    icons: [{ id: 'srv', name: 'Server', url: iconUrl, isIsometric: true }],
    colors: [
      { id: 'blue', value: '#a5b8f3' },
      { id: 'green', value: '#a8e3c0' }
    ],
    items: [
      { id: 'a', name: 'Client', icon: 'srv', description: '<p>Web <b>browser</b></p>' },
      { id: 'b', name: 'Server', icon: 'srv' }
    ],
    views: [
      {
        id: 'main',
        name: 'Main',
        items: [
          { id: 'a', tile: { x: -3, y: 0 }, labelHeight: 80 },
          { id: 'b', tile: { x: 2, y: 0 }, labelHeight: 80 }
        ],
        connectors: [
          {
            id: 'c1',
            description: 'HTTPS',
            color: 'blue',
            style: 'DASHED',
            anchors: [
              { id: 'x', ref: { item: 'a' } },
              { id: 'y', ref: { item: 'b' } }
            ]
          }
        ],
        rectangles: [
          { id: 'r1', color: 'green', from: { x: 0, y: 2 }, to: { x: 4, y: -2 } }
        ],
        textBoxes: [{ id: 't1', tile: { x: -4, y: 3 }, content: 'Production' }]
      }
    ]
  };
};

test('renderToSvg: produces a well-formed SVG document', () => {
  const { svg, width, height } = renderToSvg(makeModel());

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="-?[\d.]+ -?[\d.]+ \d+ \d+"/);
  assert.ok(width > 0 && height > 0);

  // Balanced tags: as many <g> as </g>.
  const opened = svg.match(/<g[\s>]/g)?.length ?? 0;
  const closed = svg.match(/<\/g>/g)?.length ?? 0;
  assert.equal(opened, closed);
});

test('renderToSvg: renders every element of the scene', () => {
  const { svg } = renderToSvg(makeModel());

  assert.match(svg, /<rect[^>]*fill="#a8e3c0"/, 'the rectangle, in its colour');
  assert.match(svg, /<polyline/, 'the connector');
  assert.match(svg, /<polygon/, 'the connector direction arrow');
  assert.match(svg, />HTTPS</, 'the connector label');
  assert.match(svg, />Production</, 'the text box');
  assert.match(svg, />Client</, 'a node label');
  assert.match(svg, /<symbol id="iso-icon-srv"/, 'the icon artwork, inlined');
  assert.match(svg, /<use href="#iso-icon-srv"/, 'the node icons');
  assert.match(svg, /stroke-dasharray="20, 20"/, 'the DASHED connector style');
});

test('renderToSvg: icons are inlined as symbols, not nested data URIs', () => {
  const inlined = renderToSvg(makeModel()).svg;

  // Nested <image href="data:…"> is what pdfmake (and others) cannot decode.
  assert.ok(!inlined.includes('<image'), 'no nested data-URI images by default');

  // Each icon is defined once and instanced, however many nodes use it.
  assert.equal(inlined.match(/<symbol/g).length, 1);
  assert.equal(inlined.match(/<use /g).length, 2);

  const referenced = renderToSvg(makeModel(), { inlineIcons: false }).svg;
  assert.match(referenced, /<image[^>]*data:image\/svg\+xml/);
});

test('renderToSvg: only the icons the view uses are inlined', () => {
  const model = makeModel();
  model.icons.push({ id: 'unused', name: 'Unused', url: iconUrl, isIsometric: true });

  const { svg } = renderToSvg(model);

  assert.ok(!svg.includes('iso-icon-unused'), 'unused icons are not embedded');
});

test('renderToSvg: node descriptions are flattened from HTML to text', () => {
  const { svg } = renderToSvg(makeModel());

  assert.match(svg, />Web browser</);
  assert.ok(!svg.includes('<b>'), 'HTML tags are stripped, not injected');
});

test('renderToSvg: escapes XML-significant characters', () => {
  const model = makeModel();
  model.items[0].name = 'A & B <script>';

  const { svg } = renderToSvg(model);

  assert.ok(svg.includes('&amp;'));
  assert.ok(!svg.includes('<script>'));
});

test('renderToSvg: background and grid are opt-in', () => {
  const transparent = renderToSvg(makeModel()).svg;
  assert.ok(!transparent.includes('<pattern'), 'no grid by default');

  const opaque = renderToSvg(makeModel(), {
    background: '#f6faff',
    showGrid: true
  }).svg;
  assert.match(opaque, /fill="#f6faff"/);
  assert.match(opaque, /<pattern id="iso-grid"/);
});

test('renderToSvg: margin widens the viewBox', () => {
  const tight = renderToSvg(makeModel(), { margin: 0 });
  const loose = renderToSvg(makeModel(), { margin: 2 });

  assert.ok(loose.width > tight.width);
  assert.ok(loose.height > tight.height);
});

test('renderToSvg: icon aspect ratio is read from the data URI', () => {
  const { svg } = renderToSvg(makeModel());
  const use = svg.match(/<use[^>]*width="([\d.]+)" height="([\d.]+)"/);

  assert.ok(use, 'a <use> is emitted');
  const ratio = parseFloat(use[2]) / parseFloat(use[1]);

  // The test icon's viewBox is 100x115.
  assert.ok(Math.abs(ratio - 1.15) < 0.01, `expected a 1.15 ratio, got ${ratio}`);
});

test('renderToSvg: nodes are painted back to front', () => {
  const { svg } = renderToSvg(makeModel());

  // The component stacks nodes with zIndex = -(x + y): the *lower* x + y is,
  // the closer the node is to the viewer. SVG has no z-index, so the painter's
  // algorithm must draw the high-sum nodes first.
  // 'b' (x + y = 2) is behind 'a' (x + y = -3) → 'b' is drawn first.
  assert.ok(svg.indexOf('>Server<') < svg.indexOf('>Client<'));
});

test('renderToSvg: selects a view by id', () => {
  const model = makeModel();
  model.views.push({
    id: 'other',
    name: 'Other',
    items: [{ id: 'b', tile: { x: 0, y: 0 } }]
  });

  const { svg } = renderToSvg(model, { viewId: 'other' });

  assert.match(svg, />Server</);
  assert.ok(!svg.includes('>Client<'), 'the other view is not rendered');
});

test('renderToSvg: rejects an invalid model', () => {
  const broken = makeModel();
  broken.views[0].items[0].tile = { x: 'nope', y: 0 };

  assert.throws(() => renderToSvg(broken));
});

test('renderToSvg: an empty view still renders', () => {
  const { svg, width, height } = renderToSvg({
    title: 'Empty',
    icons: [],
    colors: [],
    items: [],
    views: [{ id: 'v', name: 'Empty', items: [] }]
  });

  assert.match(svg, /<svg/);
  assert.ok(width > 0 && height > 0);
});

test('renderToSvg: the theme repaints the chrome, not the diagram', () => {
  const light = renderToSvg(makeModel(), { theme: 'light', showGrid: true }).svg;
  const dark = renderToSvg(makeModel(), { theme: 'dark', showGrid: true }).svg;

  // Chrome: labels, grid, connector halo.
  assert.match(light, /fill="#ffffff" stroke="#bdbdbd"/, 'light label box');
  assert.match(dark, /fill="#2d333b" stroke="#444c56"/, 'dark label box');
  assert.ok(!dark.includes('stroke="#bdbdbd"'), 'no light chrome left in the dark theme');

  // The model's own colours are the diagram's, and must not move with the theme.
  assert.match(light, /fill="#a8e3c0"/, 'the rectangle keeps its colour');
  assert.match(dark, /fill="#a8e3c0"/, 'the rectangle keeps its colour');
});

test('renderToSvg: light is the default (an export is not a screen)', () => {
  assert.equal(
    renderToSvg(makeModel()).svg,
    renderToSvg(makeModel(), { theme: 'light' }).svg
  );
});

test('renderToSvg: labels paint above every icon', () => {
  // The repro from #2: a labelled connector between two nodes brought close
  // together — the label must never end up under an icon.
  const model = makeModel();
  model.views[0].items = [
    { id: 'a', tile: { x: 0, y: 0 }, labelHeight: 80 },
    { id: 'b', tile: { x: 1, y: 0 }, labelHeight: 80 }
  ];

  const { svg } = renderToSvg(model);

  // SVG paints in document order: every icon (<use>) must come before the
  // first label box, node and connector labels alike.
  const lastIcon = svg.lastIndexOf('<use ');
  assert.ok(lastIcon >= 0);
  assert.ok(svg.indexOf('>HTTPS<') > lastIcon, 'connector label above icons');
  assert.ok(svg.indexOf('>Client<') > lastIcon, 'node label above icons');
});
