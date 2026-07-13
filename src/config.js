/**
 * Constants ported from Isoflow's src/config.ts.
 * Tile geometry values must not change: they define the isometric projection
 * and are baked into every existing diagram.
 */

export const UNPROJECTED_TILE_SIZE = 100;

export const TILE_PROJECTION_MULTIPLIERS = {
  width: 1.415,
  height: 0.819
};

export const PROJECTED_TILE_SIZE = {
  width: UNPROJECTED_TILE_SIZE * TILE_PROJECTION_MULTIPLIERS.width,
  height: UNPROJECTED_TILE_SIZE * TILE_PROJECTION_MULTIPLIERS.height
};

export const DEFAULT_COLOR = {
  id: '__DEFAULT__',
  value: '#a5b8f3'
};

export const DIAGRAM_BACKGROUND_COLOR = '#f6faff';

export const DEFAULT_FONT_FAMILY = 'Roboto, Arial, sans-serif';

export const VIEW_DEFAULTS = {
  name: 'Untitled view',
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: []
};

export const VIEW_ITEM_DEFAULTS = {
  labelHeight: 80
};

export const CONNECTOR_DEFAULTS = {
  width: 10,
  description: '',
  anchors: [],
  style: 'SOLID'
};

// The boundaries of the search area for the pathfinder algorithm
// is the grid that encompasses the two nodes + the offset below.
export const CONNECTOR_SEARCH_OFFSET = { x: 1, y: 1 };

export const TEXTBOX_DEFAULTS = {
  orientation: 'X',
  fontSize: 0.6,
  content: 'Text'
};

export const TEXTBOX_PADDING = 0.2;
export const TEXTBOX_FONT_WEIGHT = 'bold';

/** Facteur d'un cran de zoom (multiplicatif : ×1,25 en avant, ÷1,25 en arrière). */
export const ZOOM_STEP = 1.25;
export const MIN_ZOOM = 0.2;

/**
 * Plafond du zoom manuel. Isoflow le fixait à 1 (100 %), ce qui interdisait
 * d'agrandir pour placer une icône précisément — sans raison technique.
 */
export const MAX_ZOOM = 4;

/**
 * Plafond du zoom appliqué par `fit()`. Distinct de MAX_ZOOM : ajuster un
 * petit schéma ne doit pas l'agrandir au-delà de sa taille naturelle.
 */
export const MAX_FIT_ZOOM = 1;
export const TRANSFORM_ANCHOR_SIZE = 30;
export const TRANSFORM_CONTROLS_COLOR = '#0392ff';

export const INITIAL_DATA = {
  title: 'Untitled',
  version: '',
  icons: [],
  colors: [DEFAULT_COLOR],
  items: [],
  views: []
};

export const INITIAL_SCENE_STATE = {
  connectors: {},
  textBoxes: {}
};

export const DEFAULT_ICON = {
  id: 'default',
  name: 'block',
  isIsometric: true,
  url: ''
};

/**
 * The only user-facing strings the component owns. Everything else visible on
 * screen comes from the model or from the host app, so a full i18n layer would
 * be overkill: override these through the `strings` property instead.
 */
export const DEFAULT_STRINGS = {
  /** Name given to a node created with the place-icon tool. */
  untitledItem: 'Untitled',
  /** Prefix of the message shown when the model fails validation. */
  invalidModel: 'Invalid diagram model'
};

export const DEFAULT_LABEL_HEIGHT = 20;
export const PROJECT_BOUNDING_BOX_PADDING = 3;
export const MARKDOWN_EMPTY_VALUE = '<p><br></p>';
