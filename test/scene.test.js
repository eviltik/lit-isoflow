import { test } from 'node:test';
import assert from 'node:assert/strict';

import { modelSchema } from '../src/schemas.js';
import {
  deriveScene,
  resolveColor,
  resolveModelItem,
  resolveIcon
} from '../src/scene.js';
import * as mutations from '../src/editor/mutations.js';
import { INITIAL_DATA, CONNECTOR_DEFAULTS } from '../src/config.js';

const makeModel = () => {
  return {
    title: 'Test',
    icons: [{ id: 'server', name: 'Server', url: 'data:,', isIsometric: true }],
    colors: [
      { id: 'blue', value: '#a5b8f3' },
      { id: 'green', value: '#a8e3c0' }
    ],
    items: [
      { id: 'a', name: 'A', icon: 'server' },
      { id: 'b', name: 'B', icon: 'server' }
    ],
    views: [
      {
        id: 'main',
        name: 'Main',
        items: [
          { id: 'a', tile: { x: 0, y: 0 } },
          { id: 'b', tile: { x: 3, y: 0 } }
        ],
        connectors: [
          {
            id: 'c1',
            color: 'blue',
            anchors: [
              { id: 'a1', ref: { item: 'a' } },
              { id: 'a2', ref: { item: 'b' } }
            ]
          }
        ],
        rectangles: [
          { id: 'r1', color: 'green', from: { x: -1, y: -1 }, to: { x: 4, y: 1 } }
        ],
        textBoxes: []
      }
    ]
  };
};

test('schema: a well-formed model parses, a malformed one does not', () => {
  assert.ok(modelSchema.safeParse({ ...INITIAL_DATA, ...makeModel() }).success);

  const broken = makeModel();
  broken.views[0].items[0].tile = { x: 'nope', y: 0 };
  assert.ok(!modelSchema.safeParse({ ...INITIAL_DATA, ...broken }).success);
});

test('schema: an Isoflow/FossFLOW export round-trips through the schema', () => {
  const model = makeModel();
  const parsed = modelSchema.parse({ ...INITIAL_DATA, ...model });

  assert.deepEqual(
    JSON.parse(JSON.stringify(parsed.views[0].items)),
    model.views[0].items
  );
});

test('deriveScene: computes connector paths and merges defaults', () => {
  const scene = deriveScene(makeModel());

  assert.equal(scene.items.length, 2);
  assert.equal(scene.connectors.length, 1);
  assert.ok(scene.connectors[0].path.tiles.length >= 2);
  assert.equal(scene.connectors[0].width, CONNECTOR_DEFAULTS.width);
  assert.equal(scene.connectors[0].style, CONNECTOR_DEFAULTS.style);
  assert.equal(scene.rectangles.length, 1);
});

test('deriveScene: skips invalid connectors instead of throwing', () => {
  const model = makeModel();
  model.views[0].connectors.push({
    id: 'broken',
    anchors: [{ id: 'x', ref: { item: 'ghost' } }]
  });

  const scene = deriveScene(model);
  assert.equal(scene.connectors.length, 1);
  assert.equal(scene.connectors[0].id, 'c1');
});

test('deriveScene: selects a view by id and rejects an unknown one', () => {
  const model = makeModel();
  model.views.push({ id: 'other', name: 'Other', items: [] });

  assert.equal(deriveScene(model, 'other').view.id, 'other');
  assert.throws(() => deriveScene(model, 'ghost'), /not found/);
});

test('resolvers: colors, model items and icons', () => {
  const model = makeModel();
  const scene = deriveScene(model);

  assert.equal(resolveColor(scene.colors, 'green').value, '#a8e3c0');
  // Unknown or missing color ids fall back to the first palette entry.
  assert.equal(resolveColor(scene.colors, 'ghost').id, 'blue');
  assert.equal(resolveColor(scene.colors, undefined).id, 'blue');
  assert.equal(resolveColor([], undefined).id, '__DEFAULT__');

  assert.equal(resolveModelItem(model, 'a').name, 'A');
  assert.equal(resolveModelItem(model, 'ghost'), null);
  assert.equal(resolveIcon(model, 'server').name, 'Server');
  assert.equal(resolveIcon(model, undefined), null);
});

test('mutations: create/update/delete view items', () => {
  const model = makeModel();

  mutations.createViewItem(model, 'main', { id: 'c', tile: { x: 5, y: 5 } });
  assert.equal(model.views[0].items.length, 3);
  // New items are unshifted, matching Isoflow's layer ordering.
  assert.equal(model.views[0].items[0].id, 'c');

  mutations.updateViewItem(model, 'main', 'c', { tile: { x: 6, y: 6 } });
  assert.deepEqual(model.views[0].items[0].tile, { x: 6, y: 6 });

  mutations.deleteViewItem(model, 'main', 'c');
  assert.equal(model.views[0].items.length, 2);
});

test('mutations: deleting an item drops the connectors that referenced it', () => {
  const model = makeModel();

  mutations.deleteViewItem(model, 'main', 'b');
  assert.equal(model.views[0].connectors.length, 0);
});

test('mutations: connectors, rectangles and text boxes', () => {
  const model = makeModel();

  mutations.createConnector(model, 'main', {
    id: 'c2',
    anchors: [
      { id: 'x', ref: { item: 'a' } },
      { id: 'y', ref: { item: 'b' } }
    ]
  });
  assert.equal(model.views[0].connectors.length, 2);
  assert.equal(model.views[0].connectors[0].style, CONNECTOR_DEFAULTS.style);

  mutations.updateConnector(model, 'main', 'c2', { style: 'DASHED' });
  assert.equal(model.views[0].connectors[0].style, 'DASHED');

  mutations.deleteConnector(model, 'main', 'c2');
  assert.equal(model.views[0].connectors.length, 1);

  mutations.createRectangle(model, 'main', {
    id: 'r2',
    from: { x: 0, y: 0 },
    to: { x: 1, y: 1 }
  });
  mutations.updateRectangle(model, 'main', 'r2', { color: 'blue' });
  assert.equal(model.views[0].rectangles[0].color, 'blue');
  mutations.deleteRectangle(model, 'main', 'r2');
  assert.equal(model.views[0].rectangles.length, 1);

  mutations.createTextBox(model, 'main', {
    id: 't1',
    tile: { x: 0, y: 0 },
    content: 'Hello'
  });
  mutations.updateTextBox(model, 'main', 't1', { content: 'Bonjour' });
  assert.equal(model.views[0].textBoxes[0].content, 'Bonjour');
  mutations.deleteTextBox(model, 'main', 't1');
  assert.equal(model.views[0].textBoxes.length, 0);
});

test('mutations: model items (name, description, icon)', () => {
  const model = makeModel();

  mutations.createModelItem(model, { id: 'c', name: 'C' });
  assert.equal(model.items.length, 3);

  mutations.updateModelItem(model, 'c', { description: '<p>Hi</p>' });
  assert.equal(model.items[2].description, '<p>Hi</p>');

  mutations.deleteModelItem(model, 'c');
  assert.equal(model.items.length, 2);
});

test('mutations: layer ordering moves rectangles within their layer', () => {
  const model = makeModel();
  mutations.createRectangle(model, 'main', {
    id: 'r2',
    from: { x: 0, y: 0 },
    to: { x: 1, y: 1 }
  });
  // r2 was unshifted: [r2, r1]
  assert.deepEqual(
    model.views[0].rectangles.map((r) => r.id),
    ['r2', 'r1']
  );

  mutations.changeLayerOrder(model, 'main', {
    action: 'SEND_TO_BACK',
    item: { type: 'RECTANGLE', id: 'r2' }
  });
  assert.deepEqual(
    model.views[0].rectangles.map((r) => r.id),
    ['r1', 'r2']
  );

  mutations.changeLayerOrder(model, 'main', {
    action: 'BRING_TO_FRONT',
    item: { type: 'RECTANGLE', id: 'r2' }
  });
  assert.deepEqual(
    model.views[0].rectangles.map((r) => r.id),
    ['r2', 'r1']
  );
});

test('mutations: edits stamp the view timestamp', () => {
  const model = makeModel();
  assert.equal(model.views[0].lastUpdated, undefined);

  mutations.updateViewItem(model, 'main', 'a', { tile: { x: 1, y: 1 } });
  assert.match(model.views[0].lastUpdated, /^\d{4}-\d{2}-\d{2}T/);
});

test('mutations: the mutated model still validates against the schema', () => {
  const model = makeModel();

  mutations.createModelItem(model, { id: 'c', name: 'C', icon: 'server' });
  mutations.createViewItem(model, 'main', { id: 'c', tile: { x: 7, y: 7 } });
  mutations.createConnector(model, 'main', {
    id: 'c9',
    anchors: [
      { id: 'x', ref: { item: 'a' } },
      { id: 'y', ref: { item: 'c' } }
    ]
  });

  assert.ok(modelSchema.safeParse({ ...INITIAL_DATA, ...model }).success);
  assert.equal(deriveScene(model).connectors.length, 2);
});
