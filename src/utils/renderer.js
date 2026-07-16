/**
 * Geometry engine ported from Isoflow's src/utils/renderer.ts.
 * Everything here is pure: tile ↔ screen projection, bounding boxes,
 * connector pathfinding and fit-to-view math.
 */
import {
  UNPROJECTED_TILE_SIZE,
  PROJECTED_TILE_SIZE,
  ZOOM_STEP,
  MAX_ZOOM,
  MAX_FIT_ZOOM,
  MIN_ZOOM,
  TEXTBOX_PADDING,
  CONNECTOR_SEARCH_OFFSET,
  DEFAULT_FONT_FAMILY,
  TEXTBOX_DEFAULTS,
  TEXTBOX_FONT_WEIGHT,
  PROJECT_BOUNDING_BOX_PADDING
} from '../config.js';
import { CoordsUtils } from './coords.js';
import { SizeUtils } from './size.js';
import { clamp, toPx, getItemByIdOrThrow } from './common.js';
import { findPath } from './pathfinder.js';

/** @typedef {import('./coords.js').Coords} Coords */
/** @typedef {import('./size.js').Size} Size */
/** @typedef {'CENTER'|'TOP'|'BOTTOM'|'LEFT'|'RIGHT'} TileOrigin */

// Converts a mouse position to a tile position.
export const screenToIso = ({ mouse, zoom, scroll, rendererSize }) => {
  const projectedTileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
  const halfW = projectedTileSize.width / 2;
  const halfH = projectedTileSize.height / 2;

  const projectPosition = {
    x: -rendererSize.width * 0.5 + mouse.x - scroll.position.x,
    y: -rendererSize.height * 0.5 + mouse.y - scroll.position.y
  };

  return {
    x: Math.floor(
      (projectPosition.x + halfW) / projectedTileSize.width -
        projectPosition.y / projectedTileSize.height
    ),
    y: -Math.floor(
      (projectPosition.y + halfH) / projectedTileSize.height +
        projectPosition.x / projectedTileSize.width
    )
  };
};

/**
 * @param {{ tile: Coords, origin?: TileOrigin }} args
 * @returns {Coords} position in unzoomed scene pixels, relative to tile (0, 0)
 */
export const getTilePosition = ({ tile, origin = 'CENTER' }) => {
  const halfW = PROJECTED_TILE_SIZE.width / 2;
  const halfH = PROJECTED_TILE_SIZE.height / 2;

  const position = {
    x: halfW * tile.x - halfW * tile.y,
    y: -(halfH * tile.x + halfH * tile.y)
  };

  switch (origin) {
    case 'TOP':
      return CoordsUtils.add(position, { x: 0, y: -halfH });
    case 'BOTTOM':
      return CoordsUtils.add(position, { x: 0, y: halfH });
    case 'LEFT':
      return CoordsUtils.add(position, { x: -halfW, y: 0 });
    case 'RIGHT':
      return CoordsUtils.add(position, { x: halfW, y: 0 });
    case 'CENTER':
    default:
      return position;
  }
};

/**
 * Where a tile lands on screen, in component-relative pixels — the inverse of
 * `screenToIso`. Scene positions (getTilePosition) are zoom-1 pixels anchored
 * at the viewport centre, then translated by the scroll and scaled by the
 * zoom, exactly like the CSS transform on the scene layers.
 *
 * @param {{ tile: Coords, zoom: number, scroll: { position: Coords },
 *   rendererSize: Size, origin?: TileOrigin }} args
 * @returns {Coords} screen position, relative to the component's top-left
 */
export const tileToScreen = ({ tile, zoom, scroll, rendererSize, origin = 'CENTER' }) => {
  const position = getTilePosition({ tile, origin });

  return {
    x: rendererSize.width * 0.5 + scroll.position.x + position.x * zoom,
    y: rendererSize.height * 0.5 + scroll.position.y + position.y * zoom
  };
};

export const sortByPosition = (tiles) => {
  const xSorted = [...tiles].sort((a, b) => {
    return a.x - b.x;
  });
  const ySorted = [...tiles].sort((a, b) => {
    return a.y - b.y;
  });

  return {
    byX: xSorted,
    byY: ySorted,
    highest: { byX: xSorted[xSorted.length - 1], byY: ySorted[ySorted.length - 1] },
    lowest: { byX: xSorted[0], byY: ySorted[0] },
    lowX: xSorted[0].x,
    highX: xSorted[xSorted.length - 1].x,
    lowY: ySorted[0].y,
    highY: ySorted[ySorted.length - 1].y
  };
};

export const isWithinBounds = (tile, bounds) => {
  const { lowX, lowY, highX, highY } = sortByPosition(bounds);

  return tile.x >= lowX && tile.x <= highX && tile.y >= lowY && tile.y <= highY;
};

/**
 * Returns the four corners of a grid that encapsulates all tiles
 * passed in (at least 1 tile needed).
 * @returns {[Coords, Coords, Coords, Coords]}
 */
export const getBoundingBox = (tiles, offset = CoordsUtils.zero()) => {
  const { lowX, lowY, highX, highY } = sortByPosition(tiles);

  return [
    { x: lowX - offset.x, y: lowY - offset.y },
    { x: highX + offset.x, y: lowY - offset.y },
    { x: highX + offset.x, y: highY + offset.y },
    { x: lowX - offset.x, y: highY + offset.y }
  ];
};

/** @returns {Size} */
export const getBoundingBoxSize = (boundingBox) => {
  const { lowX, lowY, highX, highY } = sortByPosition(boundingBox);

  return {
    width: highX - lowX + 1,
    height: highY - lowY + 1
  };
};

const isoProjectionBaseValues = [0.707, -0.409, 0.707, 0.409, 0, -0.816];

export const getIsoMatrix = (orientation) => {
  if (orientation === 'Y') {
    const values = [...isoProjectionBaseValues];
    values[1] = -values[1];
    values[2] = -values[2];
    return values;
  }

  return isoProjectionBaseValues;
};

export const getIsoProjectionCss = (orientation) => {
  return `matrix(${getIsoMatrix(orientation).join(', ')})`;
};

/**
 * Le zoom est multiplicatif (chaque cran vaut ×1,25) et non additif comme
 * chez Isoflow : sur une plage de 0,2 à 4, un pas fixe de 0,2 donnerait des
 * crans énormes en bas et interminables en haut.
 */
export const incrementZoom = (zoom) => {
  return roundZoom(clamp(zoom * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
};

export const decrementZoom = (zoom) => {
  return roundZoom(clamp(zoom / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
};

const roundZoom = (zoom) => {
  return Math.round(zoom * 100) / 100;
};

export const getAllAnchors = (connectors) => {
  return connectors.reduce((acc, connector) => {
    return [...acc, ...connector.anchors];
  }, []);
};

/** @returns {Coords} */
export const getAnchorTile = (anchor, view) => {
  if (anchor.ref.item) {
    return getItemByIdOrThrow(view.items, anchor.ref.item).value.tile;
  }

  if (anchor.ref.anchor) {
    const allAnchors = getAllAnchors(view.connectors ?? []);
    const nextAnchor = getItemByIdOrThrow(allAnchors, anchor.ref.anchor).value;

    return getAnchorTile(nextAnchor, view);
  }

  if (anchor.ref.tile) {
    return anchor.ref.tile;
  }

  throw new Error('Could not get anchor tile.');
};

/**
 * Routes a connector through its anchors with A*.
 * @returns {{ tiles: Coords[], rectangle: { from: Coords, to: Coords } }}
 */
export const getConnectorPath = ({ anchors, view }) => {
  if (anchors.length < 2) {
    throw new Error(`Connector needs at least two anchors (received: ${anchors.length})`);
  }

  const anchorPositions = anchors.map((anchor) => {
    return getAnchorTile(anchor, view);
  });

  const searchArea = getBoundingBox(anchorPositions, CONNECTOR_SEARCH_OFFSET);
  const sorted = sortByPosition(searchArea);
  const searchAreaSize = getBoundingBoxSize(searchArea);
  const rectangle = {
    from: { x: sorted.highX, y: sorted.highY },
    to: { x: sorted.lowX, y: sorted.lowY }
  };

  const normalisedPositions = anchorPositions.map((position) => {
    return CoordsUtils.subtract(rectangle.from, position);
  });

  const tiles = normalisedPositions.reduce((acc, position, i) => {
    if (i === 0) return acc;

    const prev = normalisedPositions[i - 1];
    const path = findPath({
      from: prev,
      to: position,
      gridSize: searchAreaSize
    });

    return [...acc, ...path];
  }, []);

  return { tiles, rectangle };
};

/**
 * Builds the next mouse state (screen + tile position, delta, mousedown)
 * from a raw mouse event. Ported from Isoflow's getMouse.
 */
export const getMouse = ({
  interactiveElement,
  zoom,
  scroll,
  lastMouse,
  mouseEvent,
  rendererSize
}) => {
  const componentOffset = interactiveElement.getBoundingClientRect();
  const offset = {
    x: componentOffset?.left ?? 0,
    y: componentOffset?.top ?? 0
  };

  const mousePosition = {
    x: mouseEvent.clientX - offset.x,
    y: mouseEvent.clientY - offset.y
  };

  const newPosition = {
    screen: mousePosition,
    tile: screenToIso({ mouse: mousePosition, zoom, scroll, rendererSize })
  };

  const newDelta = {
    screen: CoordsUtils.subtract(newPosition.screen, lastMouse.position.screen),
    tile: CoordsUtils.subtract(newPosition.tile, lastMouse.position.tile)
  };

  const getMousedown = () => {
    switch (mouseEvent.type) {
      case 'mousedown':
        return newPosition;
      case 'mousemove':
        return lastMouse.mousedown;
      default:
        return null;
    }
  };

  return {
    position: newPosition,
    delta: newDelta,
    mousedown: getMousedown()
  };
};

export const hasMovedTile = (mouse) => {
  if (!mouse.delta) return false;

  return !CoordsUtils.isEqual(mouse.delta.tile, CoordsUtils.zero());
};

export const getTextBoxEndTile = (textBox, size) => {
  if (textBox.orientation === 'X') {
    return CoordsUtils.add(textBox.tile, { x: size.width, y: 0 });
  }

  return CoordsUtils.add(textBox.tile, { x: 0, y: -size.width });
};

/**
 * Hit-testing: returns the topmost item at a tile
 * ({ type: 'ITEM'|'TEXTBOX'|'CONNECTOR'|'RECTANGLE', id }) or null.
 * `scene` is a derived scene (see scene.js).
 */
export const getItemAtTile = ({ tile, scene }) => {
  const viewItem = scene.items.find((item) => {
    return CoordsUtils.isEqual(item.tile, tile);
  });

  if (viewItem) return { type: 'ITEM', id: viewItem.id };

  const textBox = scene.textBoxes.find((tb) => {
    const textBoxTo = getTextBoxEndTile(tb, tb.size);
    const textBoxBounds = getBoundingBox([
      tb.tile,
      {
        x: Math.ceil(textBoxTo.x),
        y: tb.orientation === 'X' ? Math.ceil(textBoxTo.y) : Math.floor(textBoxTo.y)
      }
    ]);

    return isWithinBounds(tile, textBoxBounds);
  });

  if (textBox) return { type: 'TEXTBOX', id: textBox.id };

  const connector = scene.connectors.find((con) => {
    return con.path.tiles.find((pathTile) => {
      const globalPathTile = connectorPathTileToGlobal(pathTile, con.path.rectangle.from);

      return CoordsUtils.isEqual(globalPathTile, tile);
    });
  });

  if (connector) return { type: 'CONNECTOR', id: connector.id };

  const rectangle = scene.rectangles.find(({ from, to }) => {
    return isWithinBounds(tile, [from, to]);
  });

  if (rectangle) return { type: 'RECTANGLE', id: rectangle.id };

  return null;
};

export const getAnchorAtTile = (tile, anchors) => {
  return anchors.find((anchor) => {
    return Boolean(anchor.ref.tile && CoordsUtils.isEqual(anchor.ref.tile, tile));
  });
};

export const getAnchorParent = (anchorId, connectors) => {
  const connector = connectors.find((con) => {
    return con.anchors.find((anchor) => {
      return anchor.id === anchorId;
    });
  });

  if (!connector) {
    throw new Error(`Could not find connector with anchor id ${anchorId}`);
  }

  return connector;
};

export const getConnectorsByViewItem = (viewItemId, connectors) => {
  return connectors.filter((connector) => {
    return connector.anchors.find((anchor) => {
      return anchor.ref.item === viewItemId;
    });
  });
};

/** Corner tile origins matching BOTTOM_LEFT, BOTTOM_RIGHT, TOP_RIGHT, TOP_LEFT. */
export const outermostCornerPositions = ['BOTTOM', 'RIGHT', 'TOP', 'LEFT'];

export const convertBoundsToNamedAnchors = (boundingBox) => {
  return {
    BOTTOM_LEFT: boundingBox[0],
    BOTTOM_RIGHT: boundingBox[1],
    TOP_RIGHT: boundingBox[2],
    TOP_LEFT: boundingBox[3]
  };
};

/** Converts a tile from a connector path's local space back to global tile space. */
export const connectorPathTileToGlobal = (tile, origin) => {
  return CoordsUtils.subtract(
    CoordsUtils.subtract(origin, CONNECTOR_SEARCH_OFFSET),
    CoordsUtils.subtract(tile, CONNECTOR_SEARCH_OFFSET)
  );
};

/**
 * Average glyph width as a fraction of the font size, for bold Roboto/Arial.
 * Used to estimate text width when no canvas is available (Node, SSR).
 */
const AVERAGE_GLYPH_RATIO = 0.55;

/**
 * Measures rendered text, in tile units. Matches Isoflow's getTextWidth so
 * textbox layouts stay identical in the browser; falls back to a metric
 * estimate outside a DOM (Node, SSR), where the pure SVG renderer runs.
 */
export const getTextWidth = (text, fontProps) => {
  if (!text) return 0;

  const paddingX = TEXTBOX_PADDING * UNPROJECTED_TILE_SIZE;
  const fontSizePx = fontProps.fontSize * UNPROJECTED_TILE_SIZE;
  const measured = measureTextPx(text, fontProps, fontSizePx);

  return (measured + paddingX * 2) / UNPROJECTED_TILE_SIZE - 0.8;
};

const measureTextPx = (text, fontProps, fontSizePx) => {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context) {
      context.font = `${fontProps.fontWeight} ${toPx(fontSizePx)} ${fontProps.fontFamily}`;
      const { width } = context.measureText(text);

      canvas.remove();
      return width;
    }
  }

  return text.length * fontSizePx * AVERAGE_GLYPH_RATIO;
};

/** @returns {Size} size in tile units */
export const getTextBoxDimensions = (textBox) => {
  const width = getTextWidth(textBox.content, {
    fontSize: textBox.fontSize ?? TEXTBOX_DEFAULTS.fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: TEXTBOX_FONT_WEIGHT
  });

  return { width, height: 1 };
};

/** Position and rotation of the arrow head along a connector path. */
export const getConnectorDirectionIcon = (connectorTiles) => {
  if (connectorTiles.length < 2) return null;

  const iconTile = connectorTiles[connectorTiles.length - 2];
  const lastTile = connectorTiles[connectorTiles.length - 1];

  let rotation;

  if (lastTile.x > iconTile.x) {
    if (lastTile.y > iconTile.y) rotation = 135;
    else if (lastTile.y < iconTile.y) rotation = 45;
    else rotation = 90;
  }

  if (lastTile.x < iconTile.x) {
    if (lastTile.y > iconTile.y) rotation = -135;
    else if (lastTile.y < iconTile.y) rotation = -45;
    else rotation = -90;
  }

  if (lastTile.x === iconTile.x) {
    if (lastTile.y > iconTile.y) rotation = 180;
    else if (lastTile.y < iconTile.y) rotation = 0;
    else rotation = -90;
  }

  return {
    x: iconTile.x * UNPROJECTED_TILE_SIZE + UNPROJECTED_TILE_SIZE / 2,
    y: iconTile.y * UNPROJECTED_TILE_SIZE + UNPROJECTED_TILE_SIZE / 2,
    rotation
  };
};

/** The tile-space corners encompassing everything in a view (+ padding). */
export const getProjectBounds = (view, padding = PROJECT_BOUNDING_BOX_PADDING) => {
  const itemTiles = view.items.map((item) => {
    return item.tile;
  });

  const connectorTiles = (view.connectors ?? []).reduce((acc, connector) => {
    try {
      const path = getConnectorPath({ anchors: connector.anchors, view });
      return [...acc, path.rectangle.from, path.rectangle.to];
    } catch {
      return acc;
    }
  }, []);

  const rectangleTiles = (view.rectangles ?? []).reduce((acc, rectangle) => {
    return [...acc, rectangle.from, rectangle.to];
  }, []);

  const textBoxTiles = (view.textBoxes ?? []).reduce((acc, textBox) => {
    const size = getTextBoxDimensions({ ...TEXTBOX_DEFAULTS, ...textBox });

    return [
      ...acc,
      textBox.tile,
      CoordsUtils.add(textBox.tile, { x: size.width, y: size.height })
    ];
  }, []);

  let allTiles = [...itemTiles, ...connectorTiles, ...rectangleTiles, ...textBoxTiles];

  if (allTiles.length === 0) {
    const centerTile = CoordsUtils.zero();
    allTiles = [centerTile];
  }

  return getBoundingBox(allTiles, { x: padding, y: padding });
};

export const getUnprojectedBounds = (view) => {
  const projectBounds = getProjectBounds(view);

  const cornerPositions = projectBounds.map((corner) => {
    return getTilePosition({ tile: corner });
  });
  const sortedCorners = sortByPosition(cornerPositions);
  const size = getBoundingBoxSize(cornerPositions);

  return {
    width: size.width,
    height: size.height,
    x: sortedCorners.lowX,
    y: sortedCorners.lowY
  };
};

export const getTileScrollPosition = (tile, origin) => {
  const tilePosition = getTilePosition({ tile, origin });

  return { x: -tilePosition.x, y: -tilePosition.y };
};

/** @returns {{ zoom: number, scroll: Coords }} */
export const getFitToViewParams = (view, viewportSize) => {
  const projectBounds = getProjectBounds(view);
  const sortedCornerPositions = sortByPosition(projectBounds);
  const boundingBoxSize = getBoundingBoxSize(projectBounds);
  const unprojectedBounds = getUnprojectedBounds(view);
  const zoom = clamp(
    Math.min(
      viewportSize.width / unprojectedBounds.width,
      viewportSize.height / unprojectedBounds.height
    ),
    0,
    // Ajuster ne doit jamais agrandir au-delà de la taille naturelle, même si
    // le zoom manuel, lui, peut aller plus loin.
    MAX_FIT_ZOOM
  );
  const scrollTarget = {
    x: (sortedCornerPositions.lowX + boundingBoxSize.width / 2) * zoom,
    y: (sortedCornerPositions.lowY + boundingBoxSize.height / 2) * zoom
  };

  return {
    zoom,
    scroll: getTileScrollPosition(scrollTarget)
  };
};
