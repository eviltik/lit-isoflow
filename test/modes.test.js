import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getItemsInBounds } from '../src/editor/modes.js';

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

test('getItemsInBounds: captures what the band covers', () => {
  const found = getItemsInBounds({ x: 0, y: 0 }, { x: 4, y: 4 }, scene);

  assert.deepEqual(found, [
    { type: 'ITEM', id: 'in' },
    { type: 'ITEM', id: 'edge' },
    { type: 'RECTANGLE', id: 'contained' },
    { type: 'TEXTBOX', id: 'tb-in' }
  ]);
});

test('getItemsInBounds: a zone is captured only when fully contained', () => {
  const found = getItemsInBounds({ x: 0, y: 0 }, { x: 4, y: 4 }, scene);

  // 'straddling' pokes out of the band: brushed against, not aimed at.
  assert.ok(!found.some((m) => m.id === 'straddling'));
});

test('getItemsInBounds: corner order does not matter', () => {
  const a = getItemsInBounds({ x: 0, y: 0 }, { x: 4, y: 4 }, scene);
  const b = getItemsInBounds({ x: 4, y: 4 }, { x: 0, y: 0 }, scene);

  assert.deepEqual(a, b);
});

test('getItemsInBounds: an empty band selects nothing', () => {
  const found = getItemsInBounds({ x: 20, y: 20 }, { x: 25, y: 25 }, scene);

  assert.deepEqual(found, []);
});
