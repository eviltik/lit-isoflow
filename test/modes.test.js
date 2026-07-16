import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getItemsInBounds,
  toggleSelectionMember,
  mergeSelections
} from '../src/editor/modes.js';

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
