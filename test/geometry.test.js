import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CoordsUtils } from '../src/utils/coords.js';
import { SizeUtils } from '../src/utils/size.js';
import {
  clamp,
  roundToOneDecimalPlace,
  getColorVariant,
  getItemByIdOrThrow,
  getItemById
} from '../src/utils/common.js';
import { findPath } from '../src/utils/pathfinder.js';
import {
  getTilePosition,
  screenToIso,
  getBoundingBox,
  getBoundingBoxSize,
  isWithinBounds,
  getIsoProjectionCss,
  incrementZoom,
  decrementZoom,
  getConnectorPath,
  connectorPathTileToGlobal,
  getAnchorTile,
  getConnectorDirectionIcon,
  getItemAtTile,
  getFitToViewParams,
  hasMovedTile,
  tileToScreen
} from '../src/utils/renderer.js';
import {
  PROJECTED_TILE_SIZE,
  UNPROJECTED_TILE_SIZE,
  MAX_ZOOM,
  MAX_FIT_ZOOM,
  MIN_ZOOM
} from '../src/config.js';

test('CoordsUtils: arithmetic and equality', () => {
  assert.deepEqual(CoordsUtils.add({ x: 1, y: 2 }, { x: 3, y: -1 }), { x: 4, y: 1 });
  assert.deepEqual(CoordsUtils.subtract({ x: 1, y: 2 }, { x: 3, y: -1 }), {
    x: -2,
    y: 3
  });
  assert.deepEqual(CoordsUtils.multiply({ x: 2, y: -3 }, 2), { x: 4, y: -6 });
  assert.deepEqual(CoordsUtils.zero(), { x: 0, y: 0 });
  assert.ok(CoordsUtils.isEqual({ x: 1, y: 1 }, { x: 1, y: 1 }));
  assert.ok(!CoordsUtils.isEqual({ x: 1, y: 1 }, { x: 1, y: 2 }));
});

test('SizeUtils: scaling and equality', () => {
  assert.deepEqual(SizeUtils.multiply({ width: 10, height: 4 }, 1.5), {
    width: 15,
    height: 6
  });
  assert.ok(SizeUtils.isEqual({ width: 1, height: 2 }, { width: 1, height: 2 }));
});

test('common: clamp, rounding, lookups', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(roundToOneDecimalPlace(0.6000000000000001), 0.6);

  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(getItemByIdOrThrow(items, 'b').index, 1);
  assert.throws(() => getItemByIdOrThrow(items, 'zzz'), /not found/);
  assert.equal(getItemById(items, 'zzz'), null);
});

test('common: getColorVariant returns a valid CSS color and honours alpha', () => {
  const dark = getColorVariant('#a5b8f3', 'dark', { grade: 1 });
  const light = getColorVariant('#a5b8f3', 'light', { grade: 1 });
  const translucent = getColorVariant('#a5b8f3', 'dark', { alpha: 0.5 });

  assert.match(dark, /^rgb\(\d+, \d+, \d+\)$/);
  assert.match(light, /^rgb\(\d+, \d+, \d+\)$/);
  assert.match(translucent, /^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  assert.notEqual(dark, light);

  // Shorthand hex is accepted.
  assert.match(getColorVariant('#abc', 'dark', {}), /^rgb\(/);
});

test('projection: tile (0,0) sits at the scene origin', () => {
  const origin = getTilePosition({ tile: { x: 0, y: 0 } });

  assert.equal(origin.x, 0);
  assert.equal(Math.abs(origin.y), 0);
});

test('projection: neighbouring tiles are half a projected tile apart', () => {
  const right = getTilePosition({ tile: { x: 1, y: 0 } });

  assert.equal(right.x, PROJECTED_TILE_SIZE.width / 2);
  assert.equal(right.y, -PROJECTED_TILE_SIZE.height / 2);

  const up = getTilePosition({ tile: { x: 0, y: 1 } });
  assert.equal(up.x, -PROJECTED_TILE_SIZE.width / 2);
  assert.equal(up.y, -PROJECTED_TILE_SIZE.height / 2);
});

test('projection: origin anchors offset by half a tile', () => {
  const center = getTilePosition({ tile: { x: 2, y: -1 } });
  const bottom = getTilePosition({ tile: { x: 2, y: -1 }, origin: 'BOTTOM' });
  const left = getTilePosition({ tile: { x: 2, y: -1 }, origin: 'LEFT' });

  assert.equal(bottom.y - center.y, PROJECTED_TILE_SIZE.height / 2);
  assert.equal(left.x - center.x, -PROJECTED_TILE_SIZE.width / 2);
});

test('projection: screenToIso is the inverse of the tile projection', () => {
  const rendererSize = { width: 800, height: 600 };
  const scroll = { position: { x: 0, y: 0 } };

  for (const tile of [
    { x: 0, y: 0 },
    { x: 3, y: 2 },
    { x: -4, y: 5 }
  ]) {
    const position = getTilePosition({ tile });
    const mouse = {
      x: position.x + rendererSize.width / 2,
      y: position.y + rendererSize.height / 2
    };

    const result = screenToIso({ mouse, zoom: 1, scroll, rendererSize });

    // Normalise -0 (Math.floor can produce it), which deepStrictEqual
    // distinguishes from 0.
    assert.deepEqual({ x: result.x + 0, y: result.y + 0 }, tile);
  }
});

test('projection: iso matrix flips along Y orientation', () => {
  assert.equal(getIsoProjectionCss(), 'matrix(0.707, -0.409, 0.707, 0.409, 0, -0.816)');
  assert.equal(
    getIsoProjectionCss('Y'),
    'matrix(0.707, 0.409, -0.707, 0.409, 0, -0.816)'
  );
});

test('bounding boxes: corners, size and containment', () => {
  const box = getBoundingBox([
    { x: -2, y: 1 },
    { x: 3, y: -4 }
  ]);

  assert.deepEqual(box, [
    { x: -2, y: -4 },
    { x: 3, y: -4 },
    { x: 3, y: 1 },
    { x: -2, y: 1 }
  ]);
  assert.deepEqual(getBoundingBoxSize(box), { width: 6, height: 6 });
  assert.ok(isWithinBounds({ x: 0, y: 0 }, box));
  assert.ok(!isWithinBounds({ x: 4, y: 0 }, box));
});

test('bounding boxes: offset expands the box on every side', () => {
  const box = getBoundingBox([{ x: 0, y: 0 }], { x: 1, y: 2 });

  assert.deepEqual(box[0], { x: -1, y: -2 });
  assert.deepEqual(box[2], { x: 1, y: 2 });
});

test('zoom: multiplicative steps, clamped to the configured range', () => {
  // Each step is ×1.25, so the increment scales with the current zoom.
  assert.equal(incrementZoom(1), 1.25);
  assert.equal(decrementZoom(1.25), 1);
  assert.equal(incrementZoom(0.4), 0.5);

  assert.equal(incrementZoom(MAX_ZOOM), MAX_ZOOM);
  assert.equal(decrementZoom(MIN_ZOOM), MIN_ZOOM);

  // Zooming in past 100% is allowed — that is the whole point of MAX_ZOOM > 1.
  assert.ok(incrementZoom(1) > 1);
  assert.ok(MAX_ZOOM > 1);
});

test('pathfinder: finds a path within a grid', () => {
  const path = findPath({
    gridSize: { width: 5, height: 5 },
    from: { x: 0, y: 0 },
    to: { x: 4, y: 4 }
  });

  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path[path.length - 1], { x: 4, y: 4 });
});

const view = {
  id: 'view',
  name: 'View',
  items: [
    { id: 'a', tile: { x: -3, y: 0 } },
    { id: 'b', tile: { x: 0, y: 2 } }
  ],
  connectors: [
    {
      id: 'c1',
      anchors: [
        { id: 'a1', ref: { item: 'a' } },
        { id: 'a2', ref: { item: 'b' } }
      ]
    }
  ],
  rectangles: [{ id: 'r1', from: { x: 4, y: 4 }, to: { x: 6, y: 6 } }],
  textBoxes: []
};

test('connectors: getAnchorTile resolves item and tile refs', () => {
  assert.deepEqual(getAnchorTile({ id: 'x', ref: { item: 'b' } }, view), { x: 0, y: 2 });
  assert.deepEqual(getAnchorTile({ id: 'x', ref: { tile: { x: 9, y: 9 } } }, view), {
    x: 9,
    y: 9
  });
  assert.throws(
    () => getAnchorTile({ id: 'x', ref: {} }, view),
    /Could not get anchor tile/
  );
});

test('connectors: path connects both anchors and round-trips to global tiles', () => {
  const { tiles, rectangle } = getConnectorPath({
    anchors: view.connectors[0].anchors,
    view
  });

  assert.ok(tiles.length >= 2);

  const globalTiles = tiles.map((tile) => {
    return connectorPathTileToGlobal(tile, rectangle.from);
  });

  assert.ok(
    globalTiles.some((tile) => {
      return CoordsUtils.isEqual(tile, { x: -3, y: 0 });
    }),
    'path passes through the first anchor'
  );
  assert.ok(
    globalTiles.some((tile) => {
      return CoordsUtils.isEqual(tile, { x: 0, y: 2 });
    }),
    'path passes through the second anchor'
  );
});

test('connectors: fewer than two anchors is an error', () => {
  assert.throws(
    () => getConnectorPath({ anchors: [{ id: 'a1', ref: { item: 'a' } }], view }),
    /at least two anchors/
  );
});

test('connectors: direction icon points along the last path segment', () => {
  assert.equal(
    getConnectorDirectionIcon([
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    ]).rotation,
    90
  );
  assert.equal(
    getConnectorDirectionIcon([
      { x: 0, y: 1 },
      { x: 0, y: 0 }
    ]).rotation,
    0
  );
  assert.equal(getConnectorDirectionIcon([{ x: 0, y: 0 }]), null);
});

test('hit testing: items take priority, empty tiles return null', () => {
  const scene = {
    items: view.items,
    textBoxes: [],
    connectors: [
      {
        id: 'c1',
        path: getConnectorPath({ anchors: view.connectors[0].anchors, view })
      }
    ],
    rectangles: view.rectangles
  };

  assert.deepEqual(getItemAtTile({ tile: { x: -3, y: 0 }, scene }), {
    type: 'ITEM',
    id: 'a'
  });
  assert.deepEqual(getItemAtTile({ tile: { x: 5, y: 5 }, scene }), {
    type: 'RECTANGLE',
    id: 'r1'
  });
  assert.equal(getItemAtTile({ tile: { x: -20, y: -20 }, scene }), null);
});

test('fit to view: never enlarges past 100%, and centres the content', () => {
  const { zoom, scroll } = getFitToViewParams(view, { width: 400, height: 300 });

  assert.ok(zoom > 0 && zoom <= MAX_FIT_ZOOM);
  assert.equal(typeof scroll.x, 'number');
  assert.equal(typeof scroll.y, 'number');

  // Fitting a small diagram into a huge viewport must not blow it up, even
  // though the user may zoom in past 100% by hand (MAX_ZOOM > MAX_FIT_ZOOM).
  assert.equal(
    getFitToViewParams(view, { width: 100000, height: 100000 }).zoom,
    MAX_FIT_ZOOM
  );
});

test('mouse: hasMovedTile only reacts to tile changes', () => {
  assert.ok(!hasMovedTile({ delta: null }));
  assert.ok(!hasMovedTile({ delta: { tile: { x: 0, y: 0 } } }));
  assert.ok(hasMovedTile({ delta: { tile: { x: 0, y: 1 } } }));
});

test('config: tile geometry constants are stable (diagram compatibility)', () => {
  assert.equal(UNPROJECTED_TILE_SIZE, 100);
  assert.equal(PROJECTED_TILE_SIZE.width, 141.5);
  assert.equal(Math.round(PROJECTED_TILE_SIZE.height * 100) / 100, 81.9);
});

test('tileToScreen: exact inverse of screenToIso', () => {
  // The projection must round-trip: a tile's centre, sent to the screen and
  // read back, is the same tile — whatever the zoom and scroll.
  const cases = [
    { zoom: 1, scroll: { position: { x: 0, y: 0 } } },
    { zoom: 0.05, scroll: { position: { x: 320, y: -180 } } },
    { zoom: 2.5, scroll: { position: { x: -1000, y: 400 } } }
  ];
  const rendererSize = { width: 1400, height: 900 };

  for (const { zoom, scroll } of cases) {
    for (const tile of [
      { x: 0, y: 0 },
      { x: -6, y: 0 },
      { x: 3, y: -2 },
      { x: 40, y: 55 }
    ]) {
      const screen = tileToScreen({ tile, zoom, scroll, rendererSize });
      const back = screenToIso({ mouse: screen, zoom, scroll, rendererSize });

      // -Math.floor() yields -0 for y = 0; every real consumer treats it as
      // 0, so the comparison normalises it (+ 0) rather than fail on Object.is.
      const label = `zoom ${zoom}, tile ${JSON.stringify(tile)}`;
      assert.equal(back.x + 0, tile.x, label);
      assert.equal(back.y + 0, tile.y, label);
    }
  }
});
