import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getItemsInScreenRect,
  normalizeRect,
  toggleSelectionMember,
  mergeSelections
} from '../src/editor/modes.js';
import { tileToScreen } from '../src/utils/renderer.js';

// Screen-space capture (#7): the tests build their rectangle FROM projected
// tiles, so they check the containment rules, not the projection (which has
// its own round-trip test in geometry.test.js).
const viewport = {
  zoom: 1,
  scroll: { position: { x: 0, y: 0 } },
  rendererSize: { width: 1000, height: 1000 }
};
const screenOf = (tile) => tileToScreen({ tile, ...viewport });
// A screen rectangle covering the whole tile range a..b: tiles of constant
// x+y project to the same screen Y, so the rectangle must span the four
// projected corners of the range, not just two.
const rectOver = (a, b) => {
  const pad = 10;
  const corners = [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].map(screenOf);
  return {
    minX: Math.min(...corners.map((c) => c.x)) - pad,
    maxX: Math.max(...corners.map((c) => c.x)) + pad,
    minY: Math.min(...corners.map((c) => c.y)) - pad,
    maxY: Math.max(...corners.map((c) => c.y)) + pad
  };
};

// The scene facade shape the modes receive: only the collections matter here.
const scene = {
  items: [
    { id: 'in', tile: { x: 2, y: 2 } },
    { id: 'edge', tile: { x: 0, y: 0 } },
    { id: 'out', tile: { x: 9, y: 9 } }
  ],
  rectangles: [
    { id: 'contained', from: { x: 1, y: 1 }, to: { x: 3, y: 3 } },
    { id: 'straddling', from: { x: 3, y: 3 }, to: { x: 8, y: 8 } }
  ],
  textBoxes: [
    { id: 'tb-in', tile: { x: 4, y: 0 } },
    { id: 'tb-out', tile: { x: 0, y: 9 } }
  ]
};

test('getItemsInScreenRect: captures what falls inside the rectangle on screen', () => {
  // A rectangle spanning the projected corners of tiles (0,0)..(4,4) — in
  // screen space that covers the whole diamond between them.
  const rect = rectOver({ x: 0, y: 0 }, { x: 4, y: 4 });
  const found = getItemsInScreenRect(rect, scene, viewport);

  assert.deepEqual(found, [
    { type: 'ITEM', id: 'in' },
    { type: 'ITEM', id: 'edge' },
    { type: 'RECTANGLE', id: 'contained' },
    { type: 'TEXTBOX', id: 'tb-in' }
  ]);
});

test('getItemsInScreenRect: a zone is captured only when fully contained', () => {
  const rect = rectOver({ x: 0, y: 0 }, { x: 4, y: 4 });
  const found = getItemsInScreenRect(rect, scene, viewport);

  // 'straddling' pokes out of the rectangle: brushed against, not aimed at.
  assert.ok(!found.some((m) => m.id === 'straddling'));
});

test('normalizeRect: corner order does not matter', () => {
  const a = normalizeRect({ x: 10, y: 200 }, { x: 300, y: 20 });

  assert.deepEqual(a, { minX: 10, maxX: 300, minY: 20, maxY: 200 });
});

test('getItemsInScreenRect: an empty rectangle selects nothing', () => {
  const rect = rectOver({ x: 20, y: 20 }, { x: 25, y: 25 });

  assert.deepEqual(getItemsInScreenRect(rect, scene, viewport), []);
});

test('toggleSelectionMember: adds, removes, and nulls out the last member', () => {
  const a = toggleSelectionMember(null, { type: 'ITEM', id: 'n1' });
  assert.deepEqual(a, [{ type: 'ITEM', id: 'n1' }]);

  const b = toggleSelectionMember(a, { type: 'RECTANGLE', id: 'r1' });
  assert.equal(b.length, 2);

  // Same id, different type: both stay — identity is {type, id}.
  const c = toggleSelectionMember(b, { type: 'TEXTBOX', id: 'n1' });
  assert.equal(c.length, 3);

  const d = toggleSelectionMember(c, { type: 'ITEM', id: 'n1' });
  assert.ok(!d.some((m) => m.type === 'ITEM' && m.id === 'n1'));

  // Removing the last member yields null, not an empty group.
  assert.equal(
    toggleSelectionMember([{ type: 'ITEM', id: 'x' }], { type: 'ITEM', id: 'x' }),
    null
  );
});

test('toggleSelectionMember: connectors are not selectable', () => {
  const base = [{ type: 'ITEM', id: 'n1' }];
  assert.equal(toggleSelectionMember(base, { type: 'CONNECTOR', id: 'c1' }), base);
  assert.equal(toggleSelectionMember(base, null), base);
});

test('mergeSelections: union by {type, id}, base order kept', () => {
  const base = [
    { type: 'ITEM', id: 'a' },
    { type: 'ITEM', id: 'b' }
  ];
  const added = [
    { type: 'ITEM', id: 'b' },
    { type: 'RECTANGLE', id: 'z' }
  ];

  assert.deepEqual(mergeSelections(base, added), [
    { type: 'ITEM', id: 'a' },
    { type: 'ITEM', id: 'b' },
    { type: 'RECTANGLE', id: 'z' }
  ]);
  assert.deepEqual(mergeSelections(null, added), added);
  assert.equal(mergeSelections(null, []), null);
});
