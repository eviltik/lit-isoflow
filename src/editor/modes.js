/**
 * Interaction mode state machines, ported from Isoflow's interaction/modes/*.
 *
 * Each mode is { entry?, exit?, mousemove?, mousedown?, mouseup? }, receiving
 * a state facade: { uiState, scene, isRendererInteraction }.
 * - uiState: { mode, mouse, scroll, actions: { setMode, setScroll, setItemControls, setCursor } }
 * - scene: derived scene (items/connectors with paths/rectangles/textBoxes/
 *   colors/currentView/strings) + mutation methods provided by <lit-isoflow>.
 *
 * The Lasso mode is not Isoflow's: upstream's is entirely commented out, so
 * the rubber-band selection below is lit-isoflow's own.
 */
import { generateId, getItemByIdOrThrow } from '../utils/common.js';
import { CoordsUtils } from '../utils/coords.js';
import {
  getItemAtTile,
  getItemsAtTile,
  hasMovedTile,
  getAnchorAtTile,
  getAnchorTile,
  getAnchorParent,
  connectorPathTileToGlobal,
  getBoundingBox,
  convertBoundsToNamedAnchors,
  tileToScreen
} from '../utils/renderer.js';
import { VIEW_ITEM_DEFAULTS } from '../config.js';

// --- LASSO (rubber-band selection) ---

/** Normalised screen rectangle from the band's two corners. */
export const normalizeRect = (a, b) => {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y)
  };
};

/**
 * Everything the rubber band covers, as {type, id} entries.
 *
 * The band is a SCREEN-ALIGNED rectangle (#7) — what every tool trains the
 * hand to expect — so capture happens where the eye is: an element is caught
 * when it falls inside the rectangle on screen.
 *
 * - a node or a text box, when its tile centre projects inside;
 * - a zone (rectangle), when its four projected corners are all inside —
 *   fully contained on screen; half-crossed is brushed against, not aimed at.
 *
 * Connectors are deliberately absent: the ones anchored to captured nodes
 * follow them by construction (their path is re-derived from the anchors), and
 * a tile-anchored connector cannot be group-moved through dragItems, whose
 * anchor branch re-resolves against the mouse tile — single-anchor logic.
 *
 * @param {{ minX, maxX, minY, maxY }} rect — screen px, component-relative
 * @param {object} scene
 * @param {{ zoom: number, scroll: { position: Coords }, rendererSize: Size }} viewport
 * @returns {Array<{ type: 'ITEM'|'RECTANGLE'|'TEXTBOX', id: string }>}
 */
export const getItemsInScreenRect = (rect, scene, viewport) => {
  const inside = (tile) => {
    const p = tileToScreen({ tile, ...viewport });
    return p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY;
  };
  const found = [];

  scene.items.forEach((item) => {
    if (inside(item.tile)) found.push({ type: 'ITEM', id: item.id });
  });

  scene.rectangles.forEach((rectangle) => {
    const { from, to } = rectangle;
    const corners = [from, to, { x: from.x, y: to.y }, { x: to.x, y: from.y }];

    if (corners.every(inside)) found.push({ type: 'RECTANGLE', id: rectangle.id });
  });

  scene.textBoxes.forEach((textBox) => {
    if (inside(textBox.tile)) found.push({ type: 'TEXTBOX', id: textBox.id });
  });

  return found;
};

const isSelectionMember = (selection, item) => {
  if (!selection || !item) return false;

  return selection.some((member) => {
    return member.type === item.type && member.id === item.id;
  });
};

// What a group can hold: what the band captures, and nothing else. Connectors
// stay out — dragItems cannot group-move them (see getItemsInBounds).
const SELECTABLE = new Set(['ITEM', 'RECTANGLE', 'TEXTBOX']);

/**
 * Shift+click semantics: adds the element to the group, or removes it when
 * already there — the toggle is what lets a selection be corrected instead of
 * rebuilt. Returns null when the last member is removed.
 */
export const toggleSelectionMember = (selection, item) => {
  if (!item || !SELECTABLE.has(item.type)) return selection;

  const base = selection ?? [];
  const without = base.filter((member) => {
    return !(member.type === item.type && member.id === item.id);
  });

  if (without.length < base.length) return without.length > 0 ? without : null;
  return [...base, { type: item.type, id: item.id }];
};

/** Union of two selections, by {type, id}, keeping the base's order. */
export const mergeSelections = (base, added) => {
  const merged = [...(base ?? [])];

  (added ?? []).forEach((item) => {
    if (!isSelectionMember(merged, item)) merged.push(item);
  });

  return merged.length > 0 ? merged : null;
};

/** A single-click selection, promoted to a one-member group. */
const promoteToSelection = (uiState) => {
  if (uiState.selection) return uiState.selection;

  const single = uiState.itemControls;
  if (single && SELECTABLE.has(single.type)) {
    return [{ type: single.type, id: single.id }];
  }

  return null;
};

export const Lasso = {
  entry: ({ uiState }) => {
    // A band started with Shift ADDS to the selection: keep it, folding a
    // single-click selection into the group. Otherwise a new band is a new
    // selection: whatever was selected is gone.
    if (uiState.mode.additive) {
      uiState.actions.setSelection(promoteToSelection(uiState));
    } else {
      uiState.actions.setSelection(null);
    }

    uiState.actions.setItemControls(null);
    uiState.actions.setCursor('crosshair');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState }) => {
    if (uiState.mode.type !== 'LASSO' || !uiState.mouse.mousedown) return;

    uiState.actions.setMode({
      ...uiState.mode,
      to: uiState.mouse.position.screen
    });
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'LASSO') return;

    const items = getItemsInScreenRect(
      normalizeRect(uiState.mode.from, uiState.mode.to),
      scene,
      uiState.viewport
    );
    const selection = uiState.mode.additive
      ? mergeSelections(uiState.selection, items)
      : items.length > 0
        ? items
        : null;

    uiState.actions.setSelection(selection);
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};

// --- CURSOR ---

const getAnchorOrdering = (anchor, connector, view) => {
  const anchorTile = getAnchorTile(anchor, view);
  const index = connector.path.tiles.findIndex((pathTile) => {
    const globalTile = connectorPathTileToGlobal(pathTile, connector.path.rectangle.from);
    return CoordsUtils.isEqual(globalTile, anchorTile);
  });

  if (index === -1) {
    throw new Error(
      `Could not calculate ordering index of anchor [anchorId: ${anchor.id}]`
    );
  }

  return index;
};

const getAnchor = (connectorId, tile, scene) => {
  const connector = getItemByIdOrThrow(scene.connectors, connectorId).value;
  const anchor = getAnchorAtTile(tile, connector.anchors);

  if (!anchor) {
    const newAnchor = { id: generateId(), ref: { tile } };

    const orderedAnchors = [...connector.anchors, newAnchor]
      .map((anch) => {
        return {
          ...anch,
          ordering: getAnchorOrdering(anch, connector, scene.currentView)
        };
      })
      .sort((a, b) => {
        return a.ordering - b.ordering;
      })
      .map(({ ordering: _ordering, ...anch }) => {
        return anch;
      });

    scene.updateConnector(connector.id, { anchors: orderedAnchors });
    return newAnchor;
  }

  return anchor;
};

const cursorMousedown = ({ uiState, scene, isRendererInteraction }) => {
  if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

  const tile = uiState.mouse.position.tile;
  const stack = getItemsAtTile({ tile, scene });
  let itemAtTile = stack[0] ?? null;

  // If the current selection sits in this tile's stack, press IT rather than
  // the topmost element: after clicking down to a zone buried under an icon
  // (#3), dragging must move the zone, not re-grab the icon above it.
  const held = uiState.itemControls;
  if (held && stack.some((m) => m.type === held.type && m.id === held.id)) {
    itemAtTile = { type: held.type, id: held.id };
  }

  // The selected connector's anchors take priority over items at the same
  // tile, so endpoints can be grabbed and re-anchored (lit-isoflow addition:
  // upstream offers no way to move an anchor sitting on a node).
  const selected = uiState.itemControls;
  if (selected?.type === 'CONNECTOR') {
    const connector = scene.connectors.find((c) => {
      return c.id === selected.id;
    });
    const anchor = connector?.anchors.find((a) => {
      try {
        return CoordsUtils.isEqual(getAnchorTile(a, scene.currentView), tile);
      } catch {
        return false;
      }
    });

    if (anchor) {
      itemAtTile = {
        type: 'CONNECTOR_ANCHOR',
        id: anchor.id,
        parentId: connector.id
      };
    }
  }

  // The selection as it was BEFORE this press: setItemControls below
  // overwrites it, and the click-cycle in mouseup (#3) must compare against
  // what the user saw when clicking, not what the press just selected.
  uiState.actions.setMode({
    ...uiState.mode,
    mousedownItem: itemAtTile,
    previousControls: uiState.itemControls
  });

  // With Shift held the gesture builds the selection: nothing is decided at
  // mousedown — the toggle happens on mouseup, and a band started from empty
  // canvas merges instead of replacing (Lasso reads mode.additive).
  if (uiState.shiftHeld) return;

  // Pressing on a member of a rubber-band selection must not dissolve the
  // group into single-item controls: the press may be the start of a group
  // drag. A plain click (no drag) collapses it in mouseup instead.
  if (isSelectionMember(uiState.selection, itemAtTile)) return;

  uiState.actions.setSelection(null);
  uiState.actions.setItemControls(
    itemAtTile?.type === 'CONNECTOR_ANCHOR'
      ? { type: 'CONNECTOR', id: itemAtTile.parentId }
      : itemAtTile
  );
};

export const Cursor = {
  entry: (state) => {
    const { uiState } = state;

    if (uiState.mode.type !== 'CURSOR') return;

    if (uiState.mode.mousedownItem) {
      cursorMousedown(state);
    }
  },
  mousemove: ({ scene, uiState }) => {
    if (uiState.mode.type !== 'CURSOR' || !hasMovedTile(uiState.mouse)) return;

    let item = uiState.mode.mousedownItem;

    // With Shift held the gesture is about selection, not movement: any drag
    // becomes an additive band, wherever it starts — a dense diagram may have
    // no empty tile to start from. A press without tile movement stays a
    // click, and toggles in mouseup.
    if (uiState.shiftHeld && uiState.mouse.mousedown) {
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: false,
        additive: true,
        from: uiState.mouse.mousedown.screen,
        to: uiState.mouse.position.screen
      });
      return;
    }

    // Dragging any member of a rubber-band selection moves the whole set:
    // DRAG_ITEMS has always taken an array, it just never received more than
    // one element before.
    if (isSelectionMember(uiState.selection, item)) {
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: uiState.selection,
        isInitialMovement: true
      });
      return;
    }

    // Pressed on empty canvas and moved: start a rubber band. With Shift it
    // adds to the existing selection instead of replacing it.
    if (!item && uiState.mouse.mousedown) {
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: false,
        additive: uiState.shiftHeld === true,
        from: uiState.mouse.mousedown.screen,
        to: uiState.mouse.position.screen
      });
      return;
    }

    if (item?.type === 'CONNECTOR' && uiState.mouse.mousedown) {
      const anchor = getAnchor(item.id, uiState.mouse.mousedown.tile, scene);

      item = { type: 'CONNECTOR_ANCHOR', id: anchor.id };
    }

    if (item) {
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [item],
        isInitialMovement: true
      });
    }
  },
  mousedown: cursorMousedown,
  mouseup: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

    const item = uiState.mode.mousedownItem;

    // Shift+click: toggle the element in the group (a single-click selection
    // is promoted to a one-member group first, so the group can grow from
    // it). On empty canvas or a non-selectable element, nothing changes.
    if (uiState.shiftHeld) {
      if (item && SELECTABLE.has(item.type)) {
        const selection = promoteToSelection(uiState);
        uiState.actions.setItemControls(null);
        uiState.actions.setSelection(
          toggleSelectionMember(selection, { type: item.type, id: item.id })
        );
      }

      uiState.actions.setMode({ ...uiState.mode, mousedownItem: null });
      return;
    }

    // Reaching mouseup still in CURSOR means no drag happened (a drag would
    // have switched the mode). A plain click on a selection member collapses
    // the group to that single element; a click anywhere else clears it.
    uiState.actions.setSelection(null);

    if (item) {
      // Clicking the element that was already selected cycles down the tile's
      // stack (#3): first click takes the top, the next takes what is buried
      // below, wrapping at the bottom. No state to reset — the "cycle" is
      // just where the previous selection sits in this tile's stack, so
      // clicking another tile naturally starts from its top. An anchor press
      // resolves to its parent connector first: dragging an anchor re-anchors
      // it (that hit priority is untouched), but a plain click on it must
      // keep the descent going instead of re-selecting the connector forever.
      const previous = uiState.mode.previousControls ?? null;
      let next =
        item.type === 'CONNECTOR_ANCHOR'
          ? { type: 'CONNECTOR', id: item.parentId }
          : { type: item.type, id: item.id };

      if (previous && previous.type === next.type && previous.id === next.id) {
        const stack = getItemsAtTile({ tile: uiState.mouse.position.tile, scene });
        const index = stack.findIndex((m) => {
          return m.type === previous.type && m.id === previous.id;
        });

        if (index >= 0 && stack.length > 1) {
          next = stack[(index + 1) % stack.length];
        }
      }

      uiState.actions.setItemControls(next);
    } else {
      uiState.actions.setItemControls(null);
    }

    uiState.actions.setMode({ ...uiState.mode, mousedownItem: null });
  }
};

// --- DRAG_ITEMS ---

const dragItems = (items, tile, delta, scene) => {
  items.forEach((item) => {
    if (item.type === 'ITEM') {
      const node = getItemByIdOrThrow(scene.items, item.id).value;

      scene.updateViewItem(item.id, {
        tile: CoordsUtils.add(node.tile, delta)
      });
    } else if (item.type === 'RECTANGLE') {
      const rectangle = getItemByIdOrThrow(scene.rectangles, item.id).value;

      scene.updateRectangle(item.id, {
        from: CoordsUtils.add(rectangle.from, delta),
        to: CoordsUtils.add(rectangle.to, delta)
      });
    } else if (item.type === 'TEXTBOX') {
      const textBox = getItemByIdOrThrow(scene.textBoxes, item.id).value;

      scene.updateTextBox(item.id, {
        tile: CoordsUtils.add(textBox.tile, delta)
      });
    } else if (item.type === 'CONNECTOR_ANCHOR') {
      const connector = getAnchorParent(item.id, scene.connectors);
      const anchor = getItemByIdOrThrow(connector.anchors, item.id);
      const itemAtTile = getItemAtTile({ tile, scene });

      let ref;
      switch (itemAtTile?.type) {
        case 'ITEM':
          ref = { item: itemAtTile.id };
          break;
        case 'CONNECTOR_ANCHOR':
          ref = { anchor: itemAtTile.id };
          break;
        default:
          ref = { tile };
          break;
      }

      const newAnchors = [...connector.anchors];
      newAnchors[anchor.index] = { ...anchor.value, ref };

      scene.updateConnector(connector.id, { anchors: newAnchors });
    }
  });
};

export const DragItems = {
  entry: ({ uiState }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    uiState.actions.setCursor('move');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    if (uiState.mode.isInitialMovement) {
      const delta = CoordsUtils.subtract(
        uiState.mouse.position.tile,
        uiState.mouse.mousedown.tile
      );

      dragItems(uiState.mode.items, uiState.mouse.position.tile, delta, scene);
      uiState.actions.setMode({ ...uiState.mode, isInitialMovement: false });

      return;
    }

    if (!hasMovedTile(uiState.mouse) || !uiState.mouse.delta?.tile) return;

    dragItems(
      uiState.mode.items,
      uiState.mouse.position.tile,
      uiState.mouse.delta.tile,
      scene
    );
  },
  mouseup: ({ uiState }) => {
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};

// --- PAN ---

export const Pan = {
  entry: ({ uiState }) => {
    uiState.actions.setCursor('grab');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState }) => {
    if (uiState.mode.type !== 'PAN') return;

    if (uiState.mouse.mousedown !== null && uiState.mouse.delta?.screen) {
      uiState.actions.setScroll({
        position: CoordsUtils.add(uiState.scroll.position, uiState.mouse.delta.screen)
      });
    }
  },
  mousedown: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'PAN' || !isRendererInteraction) return;

    uiState.actions.setCursor('grabbing');
  },
  mouseup: ({ uiState }) => {
    uiState.actions.setCursor('grab');
  }
};

// --- PLACE_ICON ---

export const PlaceIcon = {
  mousedown: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'PLACE_ICON' || !isRendererInteraction) return;

    if (!uiState.mode.id) {
      const itemAtTile = getItemAtTile({
        tile: uiState.mouse.position.tile,
        scene
      });

      uiState.actions.setMode({
        type: 'CURSOR',
        mousedownItem: itemAtTile,
        showCursor: true
      });

      uiState.actions.setItemControls(null);
    }
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'PLACE_ICON') return;

    if (uiState.mode.id !== null) {
      const modelItemId = generateId();

      scene.createModelItem({
        id: modelItemId,
        name: scene.strings.untitledItem,
        icon: uiState.mode.id
      });

      scene.createViewItem({
        ...VIEW_ITEM_DEFAULTS,
        id: modelItemId,
        tile: uiState.mouse.position.tile
      });
    }

    uiState.actions.setMode({ ...uiState.mode, id: null });
  }
};

// --- CONNECTOR ---

export const Connector = {
  entry: ({ uiState }) => {
    uiState.actions.setCursor('crosshair');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (
      uiState.mode.type !== 'CONNECTOR' ||
      !uiState.mode.id ||
      !hasMovedTile(uiState.mouse)
    )
      return;

    const connector = getItemByIdOrThrow(
      scene.currentView.connectors ?? [],
      uiState.mode.id
    );

    const itemAtTile = getItemAtTile({
      tile: uiState.mouse.position.tile,
      scene
    });

    const newAnchors = [...connector.value.anchors];
    newAnchors[1] = {
      id: generateId(),
      ref:
        itemAtTile?.type === 'ITEM'
          ? { item: itemAtTile.id }
          : { tile: uiState.mouse.position.tile }
    };

    scene.updateConnector(uiState.mode.id, { anchors: newAnchors });
  },
  mousedown: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CONNECTOR' || !isRendererInteraction) return;

    const newConnector = {
      id: generateId(),
      color: scene.colors[0]?.id,
      anchors: []
    };

    const itemAtTile = getItemAtTile({
      tile: uiState.mouse.position.tile,
      scene
    });

    if (itemAtTile && itemAtTile.type === 'ITEM') {
      newConnector.anchors = [
        { id: generateId(), ref: { item: itemAtTile.id } },
        { id: generateId(), ref: { item: itemAtTile.id } }
      ];
    } else {
      newConnector.anchors = [
        { id: generateId(), ref: { tile: uiState.mouse.position.tile } },
        { id: generateId(), ref: { tile: uiState.mouse.position.tile } }
      ];
    }

    scene.createConnector(newConnector);

    uiState.actions.setMode({
      type: 'CONNECTOR',
      showCursor: true,
      id: newConnector.id
    });
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'CONNECTOR' || !uiState.mode.id) return;

    const connector = getItemByIdOrThrow(scene.connectors, uiState.mode.id);
    const firstAnchor = connector.value.anchors[0];
    const lastAnchor = connector.value.anchors[connector.value.anchors.length - 1];

    if (
      connector.value.path.tiles.length < 2 ||
      !(firstAnchor.ref.item && lastAnchor.ref.item)
    ) {
      scene.deleteConnector(uiState.mode.id);
    }

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};

// --- RECTANGLE.DRAW ---

export const DrawRectangle = {
  entry: ({ uiState }) => {
    uiState.actions.setCursor('crosshair');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (
      uiState.mode.type !== 'RECTANGLE.DRAW' ||
      !hasMovedTile(uiState.mouse) ||
      !uiState.mode.id ||
      !uiState.mouse.mousedown
    )
      return;

    scene.updateRectangle(uiState.mode.id, {
      to: uiState.mouse.position.tile
    });
  },
  mousedown: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !isRendererInteraction) return;

    const newRectangleId = generateId();

    scene.createRectangle({
      id: newRectangleId,
      color: scene.colors[0]?.id,
      from: uiState.mouse.position.tile,
      to: uiState.mouse.position.tile
    });

    uiState.actions.setMode({ ...uiState.mode, id: newRectangleId });
  },
  mouseup: ({ uiState }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !uiState.mode.id) return;

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};

// --- RECTANGLE.TRANSFORM ---

export const TransformRectangle = {
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'RECTANGLE.TRANSFORM' || !hasMovedTile(uiState.mouse))
      return;

    if (uiState.mode.selectedAnchor) {
      const rectangle = getItemByIdOrThrow(scene.rectangles, uiState.mode.id).value;
      const rectangleBounds = getBoundingBox([rectangle.to, rectangle.from]);
      const namedBounds = convertBoundsToNamedAnchors(rectangleBounds);

      if (
        uiState.mode.selectedAnchor === 'BOTTOM_LEFT' ||
        uiState.mode.selectedAnchor === 'TOP_RIGHT'
      ) {
        const nextBounds = getBoundingBox([
          uiState.mode.selectedAnchor === 'BOTTOM_LEFT'
            ? namedBounds.TOP_RIGHT
            : namedBounds.BOTTOM_LEFT,
          uiState.mouse.position.tile
        ]);
        const nextNamedBounds = convertBoundsToNamedAnchors(nextBounds);

        scene.updateRectangle(uiState.mode.id, {
          from: nextNamedBounds.TOP_RIGHT,
          to: nextNamedBounds.BOTTOM_LEFT
        });
      } else if (
        uiState.mode.selectedAnchor === 'BOTTOM_RIGHT' ||
        uiState.mode.selectedAnchor === 'TOP_LEFT'
      ) {
        const nextBounds = getBoundingBox([
          uiState.mode.selectedAnchor === 'BOTTOM_RIGHT'
            ? namedBounds.TOP_LEFT
            : namedBounds.BOTTOM_RIGHT,
          uiState.mouse.position.tile
        ]);
        const nextNamedBounds = convertBoundsToNamedAnchors(nextBounds);

        scene.updateRectangle(uiState.mode.id, {
          from: nextNamedBounds.TOP_LEFT,
          to: nextNamedBounds.BOTTOM_RIGHT
        });
      }
    }
  },
  mousedown: () => {
    // Mousedown is triggered by the transform anchor itself (see <lit-isoflow>).
  },
  mouseup: ({ uiState }) => {
    if (uiState.mode.type !== 'RECTANGLE.TRANSFORM') return;

    uiState.actions.setMode({
      type: 'CURSOR',
      mousedownItem: null,
      showCursor: true
    });
  }
};

// --- TEXTBOX ---

export const TextBox = {
  entry: ({ uiState }) => {
    uiState.actions.setCursor('crosshair');
  },
  exit: ({ uiState }) => {
    uiState.actions.setCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'TEXTBOX' || !uiState.mode.id) return;

    scene.updateTextBox(uiState.mode.id, {
      tile: uiState.mouse.position.tile
    });
  },
  mouseup: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'TEXTBOX' || !uiState.mode.id) return;

    if (!isRendererInteraction) {
      scene.deleteTextBox(uiState.mode.id);
    } else {
      uiState.actions.setItemControls({ type: 'TEXTBOX', id: uiState.mode.id });
    }

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};

export const interactionModes = {
  CURSOR: Cursor,
  LASSO: Lasso,
  DRAG_ITEMS: DragItems,
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  PAN: Pan,
  PLACE_ICON: PlaceIcon,
  TEXTBOX: TextBox
};
