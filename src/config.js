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

export const ZOOM_INCREMENT = 0.2;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 1;
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

export const DEFAULT_LABEL_HEIGHT = 20;
export const PROJECT_BOUNDING_BOX_PADDING = 3;
export const MARKDOWN_EMPTY_VALUE = '<p><br></p>';
