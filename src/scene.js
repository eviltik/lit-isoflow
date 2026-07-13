/**
 * Scene derivation: computes the display-only state (connector paths,
 * textbox sizes) from a model + view, and merges defaults.
 *
 * Equivalent to Isoflow's syncScene/useScene, rewritten as pure functions
 * (no zustand, no immer): the scene is recomputed from the model on demand.
 */
import { CONNECTOR_DEFAULTS, TEXTBOX_DEFAULTS, DEFAULT_COLOR } from './config.js';
import { getItemByIdOrThrow, getItemById } from './utils/common.js';
import { getConnectorPath, getTextBoxDimensions } from './utils/renderer.js';

/**
 * @param {object} model - parsed model (see schemas.js)
 * @param {string} [viewId] - defaults to the first view
 * @returns {{
 *   view: object,
 *   items: object[],
 *   connectors: object[],
 *   rectangles: object[],
 *   textBoxes: object[],
 *   colors: object[]
 * }}
 */
export const deriveScene = (model, viewId) => {
  const view = viewId ? getItemByIdOrThrow(model.views, viewId).value : model.views[0];

  if (!view) {
    throw new Error('Model has no views.');
  }

  const connectors = (view.connectors ?? []).reduce((acc, connector) => {
    try {
      const path = getConnectorPath({ anchors: connector.anchors, view });
      acc.push({ ...CONNECTOR_DEFAULTS, ...connector, path });
    } catch {
      // Invalid connectors (missing anchors, dangling refs) are skipped
      // instead of breaking the whole scene, like Isoflow's syncConnector.
    }
    return acc;
  }, []);

  const textBoxes = (view.textBoxes ?? []).map((textBox) => {
    const merged = { ...TEXTBOX_DEFAULTS, ...textBox };
    return { ...merged, size: getTextBoxDimensions(merged) };
  });

  return {
    view,
    items: view.items ?? [],
    connectors,
    rectangles: view.rectangles ?? [],
    textBoxes,
    colors: model.colors ?? []
  };
};

/** Resolves a color id against the model palette, falling back gracefully. */
export const resolveColor = (colors, colorId) => {
  if (colorId !== undefined) {
    const color = getItemById(colors, colorId);
    if (color) return color;
  }

  return colors.length > 0 ? colors[0] : DEFAULT_COLOR;
};

/** Resolves a model item (name, description, icon id) for a view item. */
export const resolveModelItem = (model, viewItemId) => {
  return getItemById(model.items, viewItemId);
};

/** Resolves an icon for a model item. */
export const resolveIcon = (model, iconId) => {
  if (!iconId) return null;

  return getItemById(model.icons, iconId);
};
