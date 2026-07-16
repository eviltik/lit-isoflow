/**
 * Pure-JS SVG renderer: model → SVG string, with **no DOM**.
 *
 * This is the same scene the <lit-isoflow> component draws, emitted as SVG
 * markup instead of DOM. It runs anywhere JavaScript runs — Node, a CLI, a
 * build step, a server — which is what makes vector output possible in
 * pipelines that have no browser (PDF generators, static site builds).
 *
 * Geometry is shared with the component (utils/renderer.js), so both stay in
 * step by construction. The component's `exportSvg()` is a thin wrapper here.
 *
 * Layer order mirrors the component: rectangles < grid < connectors <
 * textBoxes < connector labels < nodes.
 */
import {
  PROJECTED_TILE_SIZE,
  UNPROJECTED_TILE_SIZE,
  DIAGRAM_BACKGROUND_COLOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LABEL_HEIGHT,
  TEXTBOX_PADDING,
  TEXTBOX_FONT_WEIGHT,
  MARKDOWN_EMPTY_VALUE,
  INITIAL_DATA
} from './config.js';
import { modelSchema } from './schemas.js';
import { deriveScene, resolveColor, resolveModelItem, resolveIcon } from './scene.js';
import {
  getTilePosition,
  getBoundingBox,
  getIsoMatrix,
  getConnectorDirectionIcon,
  connectorPathTileToGlobal
} from './utils/renderer.js';
import { getColorVariant } from './utils/common.js';
import { GRID_TILE_VIEWBOX, gridTileBody } from './assets/grid-tile.js';
import { resolveTheme } from './theme.js';

/** Rough label metrics; the DOM sizes labels to their content, we estimate. */
const LABEL_FONT_SIZE = 11;
const LABEL_LINE_HEIGHT = 14;
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 7;
const LABEL_MAX_WIDTH = 250;
const LABEL_CHAR_RATIO = 0.55;

const escapeXml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/** Strips tags from an HTML description and collapses whitespace. */
const htmlToText = (html) => {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

/** Greedy word wrap by estimated glyph width. */
const wrapText = (text, maxWidth, fontSize) => {
  const charWidth = fontSize * LABEL_CHAR_RATIO;
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines = [];
  let current = '';

  text.split(/\s+/).forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  return lines;
};

const textWidthPx = (text, fontSize) => {
  return text.length * fontSize * LABEL_CHAR_RATIO;
};

/**
 * Position + isometric transform of a surface spanning [from, to],
 * mirroring the component's _projectionStyles().
 */
const project = (from, to, orientation) => {
  const gridSize = {
    width: Math.abs(from.x - to.x) + 1,
    height: Math.abs(from.y - to.y) + 1
  };
  const origin = getBoundingBox([from, to])[3];
  const position = getTilePosition({
    tile: origin,
    origin: orientation === 'Y' ? 'TOP' : 'LEFT'
  });
  const size = {
    width: gridSize.width * UNPROJECTED_TILE_SIZE,
    height: gridSize.height * UNPROJECTED_TILE_SIZE
  };
  const matrix = getIsoMatrix(orientation).join(', ');

  return {
    // CSS `left/top` + `transform` with `transform-origin: top left` is a
    // translate followed by the matrix.
    transform: `translate(${position.x}, ${position.y}) matrix(${matrix})`,
    size
  };
};

const renderRectangles = (scene) => {
  return scene.rectangles
    .map((rectangle) => {
      const color = resolveColor(scene.colors, rectangle.color);
      const { transform, size } = project(rectangle.from, rectangle.to);

      return (
        `<g transform="${transform}">` +
        `<rect width="${size.width}" height="${size.height}" rx="22" ` +
        `fill="${escapeXml(color.value)}" ` +
        `stroke="${escapeXml(getColorVariant(color.value, 'dark', { grade: 2 }))}" ` +
        `stroke-width="1"/>` +
        `</g>`
      );
    })
    .join('');
};

const renderConnectors = (scene, theme) => {
  return scene.connectors
    .map((connector) => {
      const color = resolveColor(scene.colors, connector.color);
      const { transform, size } = project(
        connector.path.rectangle.from,
        connector.path.rectangle.to
      );

      const drawOffset = UNPROJECTED_TILE_SIZE / 2;
      const points = connector.path.tiles
        .map((tile) => {
          return `${tile.x * UNPROJECTED_TILE_SIZE + drawOffset},${
            tile.y * UNPROJECTED_TILE_SIZE + drawOffset
          }`;
        })
        .join(' ');

      const widthPx = (UNPROJECTED_TILE_SIZE / 100) * connector.width;

      let dashArray = 'none';
      if (connector.style === 'DASHED') dashArray = `${widthPx * 2}, ${widthPx * 2}`;
      if (connector.style === 'DOTTED') dashArray = `0, ${widthPx * 1.8}`;

      const directionIcon = getConnectorDirectionIcon(connector.path.tiles);
      const arrow = directionIcon
        ? `<g transform="translate(${directionIcon.x}, ${directionIcon.y}) rotate(${directionIcon.rotation})">` +
          `<polygon points="17.58,17.01 0,-17.01 -17.58,17.01" fill="${theme.connectorArrow}" stroke="${theme.connectorArrowStroke}" stroke-width="4"/>` +
          `</g>`
        : '';

      // The component mirrors the connector <svg> along X (an upstream quirk:
      // path x-coordinates come out flipped). CSS mirrors about the element's
      // centre, so the SVG equivalent is a mirror about width/2.
      return (
        `<g transform="${transform} translate(${size.width / 2}, 0) scale(-1, 1) translate(${-size.width / 2}, 0)">` +
        `<polyline points="${points}" fill="none" stroke="${theme.connectorHalo}" ` +
        `stroke-width="${widthPx * 1.4}" stroke-linecap="round" stroke-linejoin="round" ` +
        `stroke-opacity="0.7" stroke-dasharray="${dashArray}"/>` +
        `<polyline points="${points}" fill="none" ` +
        `stroke="${escapeXml(getColorVariant(color.value, 'dark', { grade: 1 }))}" ` +
        `stroke-width="${widthPx}" stroke-linecap="round" stroke-linejoin="round" ` +
        `stroke-dasharray="${dashArray}"/>` +
        arrow +
        `</g>`
      );
    })
    .join('');
};

const renderTextBoxes = (scene, theme) => {
  return scene.textBoxes
    .map((textBox) => {
      const to = { x: textBox.tile.x + textBox.size.width, y: textBox.tile.y };
      const { transform, size } = project(textBox.tile, to, textBox.orientation);
      const fontSize = UNPROJECTED_TILE_SIZE * textBox.fontSize;
      const paddingX = UNPROJECTED_TILE_SIZE * TEXTBOX_PADDING;

      return (
        `<g transform="${transform}">` +
        `<text x="${paddingX}" y="${size.height / 2}" ` +
        `dominant-baseline="central" ` +
        `font-family="${escapeXml(DEFAULT_FONT_FAMILY)}" font-size="${fontSize}" ` +
        `font-weight="${TEXTBOX_FONT_WEIGHT}" fill="${theme.textBoxText}">` +
        escapeXml(textBox.content) +
        `</text></g>`
      );
    })
    .join('');
};

/**
 * Size of a label box, from its content. Shared by the renderer and the bounds
 * computation so the viewBox matches exactly what gets painted.
 */
const labelBoxSize = (lines, fontSize = LABEL_FONT_SIZE) => {
  return {
    width:
      Math.min(
        LABEL_MAX_WIDTH,
        Math.max(...lines.map((line) => textWidthPx(line, fontSize)))
      ) +
      LABEL_PADDING_X * 2,
    height: lines.length * LABEL_LINE_HEIGHT + LABEL_PADDING_Y * 2
  };
};

/** The label lines of a node: its name, then its (flattened) description. */
const nodeLabelLines = (modelItem) => {
  const lines = [];

  if (modelItem.name) {
    lines.push(...wrapText(modelItem.name, LABEL_MAX_WIDTH, LABEL_FONT_SIZE));
  }

  const description =
    modelItem.description && modelItem.description !== MARKDOWN_EMPTY_VALUE
      ? htmlToText(modelItem.description)
      : '';
  if (description) {
    lines.push(...wrapText(description, LABEL_MAX_WIDTH, LABEL_FONT_SIZE));
  }

  return lines;
};

/** A white rounded label box with centred text lines, in screen space. */
const labelBox = (lines, x, y, anchor, theme, extra = {}) => {
  const { fontSize = LABEL_FONT_SIZE, color = theme.labelText, bold = false } = extra;
  const { width, height } = labelBoxSize(lines, fontSize);

  // anchor: 'bottom' → the box sits above (x, y); 'center' → centred on it.
  const boxX = x - width / 2;
  const boxY = anchor === 'bottom' ? y - height : y - height / 2;

  const texts = lines
    .map((line, i) => {
      const lineY = boxY + LABEL_PADDING_Y + LABEL_LINE_HEIGHT * (i + 0.5);

      return (
        `<text x="${x}" y="${lineY}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="${escapeXml(DEFAULT_FONT_FAMILY)}" font-size="${fontSize}" ` +
        `${bold && i === 0 ? 'font-weight="600" ' : ''}fill="${color}">` +
        escapeXml(line) +
        `</text>`
      );
    })
    .join('');

  return (
    `<rect x="${boxX}" y="${boxY}" width="${width}" height="${height}" rx="8" ` +
    `fill="${theme.labelBackground}" stroke="${theme.labelBorder}" stroke-width="1"/>` +
    texts
  );
};

const renderConnectorLabels = (scene, theme) => {
  return scene.connectors
    .map((connector) => {
      if (!connector.description) return '';

      const tile = connector.path.tiles[Math.floor(connector.path.tiles.length / 2)];
      if (!tile) return '';

      const position = getTilePosition({
        tile: connectorPathTileToGlobal(tile, connector.path.rectangle.from)
      });
      const lines = wrapText(connector.description, 150, LABEL_FONT_SIZE);

      return labelBox(lines, position.x, position.y, 'center', theme, {
        fontSize: 10,
        color: theme.labelMutedText
      });
    })
    .join('');
};

/**
 * Extracts the innards of an SVG data URI plus its viewBox, so the artwork can
 * be inlined as a <symbol> instead of referenced with <image href="data:...">.
 * Some SVG consumers (pdfmake among them) cannot decode nested data URIs, and
 * inlining also keeps the output truly vector.
 */
const iconSymbol = (icon) => {
  const markup = decodeDataUri(icon.url);
  if (!markup) return null;

  const open = markup.match(/<svg\b[^>]*>/i);
  const close = markup.lastIndexOf('</svg>');
  if (!open || close === -1) return null;

  const size = intrinsicSize(icon.url);
  if (!size) return null;

  const viewBox =
    open[0].match(/viewBox=["']([^"']+)["']/i)?.[1] ?? `0 0 ${size.width} ${size.height}`;
  const body = markup.slice(open.index + open[0].length, close);

  return { viewBox, body, size };
};

const renderNodes = (scene, model, icons, symbols) => {
  // Painter's algorithm: the component leans on z-index, SVG on document order,
  // so draw back-to-front (highest x+y first). Icons only — labels live in
  // their own pass above every icon (#2), like the component's label layer.
  const sorted = [...scene.items].sort((a, b) => {
    return b.tile.x + b.tile.y - (a.tile.x + a.tile.y);
  });

  return sorted
    .map((item) => {
      const modelItem = resolveModelItem(model, item.id);
      if (!modelItem) return '';

      const icon = resolveIcon(model, modelItem.icon);
      if (!icon || !icons[icon.id]) return '';

      const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
      const iconWidth =
        PROJECTED_TILE_SIZE.width * (icon.isIsometric === false ? 0.7 : 0.8);
      const { width, height } = icons[icon.id];
      const iconHeight = (height / width) * iconWidth;

      // Inlined artwork (<use> of a <symbol>) when we could decode it,
      // <image href="data:…"> otherwise — the latter is not understood by
      // every SVG consumer, hence the preference for symbols.
      const artwork = (x, y) => {
        return symbols[icon.id]
          ? `<use href="#iso-icon-${escapeXml(icon.id)}" x="${x}" y="${y}" ` +
              `width="${iconWidth}" height="${iconHeight}"/>`
          : `<image href="${escapeXml(icon.url)}" x="${x}" y="${y}" ` +
              `width="${iconWidth}" height="${iconHeight}"/>`;
      };

      if (icon.isIsometric === false) {
        // Flat artwork: projected onto the ground plane.
        const { transform } = projectFlatIcon(position);
        return `<g transform="${transform}">${artwork(0, 0)}</g>`;
      }

      return artwork(position.x - iconWidth / 2, position.y - iconHeight);
    })
    .join('');
};

/**
 * Node labels and their leader lines, painted above every icon (#2): a label
 * must never be hidden by a node in front — being readable is the one thing
 * it is for. Back-to-front order is kept so labels stack among themselves
 * like their nodes do. The leader line travels with its label, so its dotted
 * foot now paints over the icon instead of being covered by it — the same
 * trade the component makes.
 */
const renderNodeLabels = (scene, model, theme) => {
  const sorted = [...scene.items].sort((a, b) => {
    return b.tile.x + b.tile.y - (a.tile.x + a.tile.y);
  });

  return sorted
    .map((item) => {
      const modelItem = resolveModelItem(model, item.id);
      if (!modelItem) return '';

      const lines = nodeLabelLines(modelItem);
      if (lines.length === 0) return '';

      const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
      const labelHeight = item.labelHeight ?? DEFAULT_LABEL_HEIGHT;
      const labelAnchorY = PROJECTED_TILE_SIZE.height / 2;
      const labelY = position.y - labelAnchorY;

      let parts = '';

      if (labelHeight > 0) {
        parts +=
          `<line x1="${position.x}" y1="${labelY}" x2="${position.x}" y2="${labelY - labelHeight}" ` +
          `stroke="${theme.leaderLine}" stroke-width="3" stroke-linecap="round" stroke-dasharray="0, 6"/>`;
      }

      parts += labelBox(lines, position.x, labelY - labelHeight, 'bottom', theme, {
        bold: true
      });

      return parts;
    })
    .join('');
};

/**
 * Bounds of the rendered content in screen space, computed rather than
 * measured — the DOM-based exportPng() measures the same thing with
 * getBoundingClientRect().
 */
const contentBounds = (scene, model, icons, margin) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const includeBox = (x, y, width, height) => {
    include(x, y);
    include(x + width, y + height);
  };

  /**
   * The four projected corners of a tile-space surface, each tile being a
   * diamond that reaches half a tile out from its centre.
   */
  const includeSurface = (from, to) => {
    getBoundingBox([from, to]).forEach((corner) => {
      const position = getTilePosition({ tile: corner });

      include(position.x - PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x + PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x, position.y - PROJECTED_TILE_SIZE.height / 2);
      include(position.x, position.y + PROJECTED_TILE_SIZE.height / 2);
    });
  };

  scene.rectangles.forEach((rectangle) => {
    includeSurface(rectangle.from, rectangle.to);
  });

  // A connector's search rectangle is much wider than the path drawn inside it:
  // bound the tiles actually walked, not the A* search area.
  scene.connectors.forEach((connector) => {
    connector.path.tiles.forEach((tile) => {
      const globalTile = connectorPathTileToGlobal(tile, connector.path.rectangle.from);
      const position = getTilePosition({ tile: globalTile });

      include(position.x - PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x + PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x, position.y - PROJECTED_TILE_SIZE.height / 2);
      include(position.x, position.y + PROJECTED_TILE_SIZE.height / 2);
    });

    if (connector.description) {
      const tile = connector.path.tiles[Math.floor(connector.path.tiles.length / 2)];
      if (tile) {
        const position = getTilePosition({
          tile: connectorPathTileToGlobal(tile, connector.path.rectangle.from)
        });
        const lines = wrapText(connector.description, 150, LABEL_FONT_SIZE);
        const { width, height } = labelBoxSize(lines, 10);

        includeBox(position.x - width / 2, position.y - height / 2, width, height);
      }
    }
  });

  scene.textBoxes.forEach((textBox) => {
    includeSurface(textBox.tile, {
      x: textBox.tile.x + Math.ceil(textBox.size.width),
      y: textBox.tile.y
    });
  });

  scene.items.forEach((item) => {
    const modelItem = resolveModelItem(model, item.id);
    if (!modelItem) return;

    const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
    const icon = resolveIcon(model, modelItem.icon);

    // Icon artwork, drawn upwards from the tile's bottom anchor — same maths as
    // renderNodes(), so the box matches what is actually painted.
    if (icon && icons[icon.id]) {
      const iconWidth =
        PROJECTED_TILE_SIZE.width * (icon.isIsometric === false ? 0.7 : 0.8);
      const { width, height } = icons[icon.id];
      const iconHeight = (height / width) * iconWidth;

      includeBox(
        position.x - iconWidth / 2,
        position.y - iconHeight,
        iconWidth,
        iconHeight
      );
    } else {
      // No artwork: the tile itself still occupies space.
      includeSurface(item.tile, item.tile);
    }

    const lines = nodeLabelLines(modelItem);
    if (lines.length === 0) return;

    // Label box, sized to its content rather than to LABEL_MAX_WIDTH: a
    // « Web 1 » label is 60 px wide, not 250, and over-reserving here is what
    // pushed the viewBox out of balance.
    const labelHeight = item.labelHeight ?? DEFAULT_LABEL_HEIGHT;
    const anchorY = position.y - PROJECTED_TILE_SIZE.height / 2 - labelHeight;
    const { width, height } = labelBoxSize(lines, LABEL_FONT_SIZE);

    includeBox(position.x - width / 2, anchorY - height, width, height);
  });

  if (minX === Infinity) {
    // Empty view: fall back to a single tile around the origin.
    include(-PROJECTED_TILE_SIZE.width, -PROJECTED_TILE_SIZE.height);
    include(PROJECTED_TILE_SIZE.width, PROJECTED_TILE_SIZE.height);
  }

  const pad = margin * UNPROJECTED_TILE_SIZE;

  return {
    minX: Math.floor(minX - pad),
    minY: Math.floor(minY - pad),
    width: Math.ceil(maxX - minX + pad * 2),
    height: Math.ceil(maxY - minY + pad * 2)
  };
};

/** Base64 decoding that works in both the browser and Node. */
const decodeBase64 = (payload) => {
  if (typeof globalThis.atob === 'function') {
    // Round-trip through URI escaping so multi-byte UTF-8 survives.
    return decodeURIComponent(
      globalThis
        .atob(payload)
        .split('')
        .map((char) => {
          return `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`;
        })
        .join('')
    );
  }

  return globalThis.Buffer.from(payload, 'base64').toString('utf8');
};

/** Decodes an SVG data URI to its markup, or null if it is not one. */
const decodeDataUri = (url) => {
  if (typeof url !== 'string' || !url.startsWith('data:image/svg+xml')) return null;

  try {
    const comma = url.indexOf(',');
    const payload = url.slice(comma + 1);

    return url.slice(0, comma).includes(';base64')
      ? decodeBase64(payload)
      : decodeURIComponent(payload);
  } catch {
    return null;
  }
};

/**
 * Aspect ratio of an SVG data-URI icon, read from its viewBox — the DOM would
 * get this by loading the image, we parse it. Returns null for raster icons
 * (callers can pass `iconSizes` for those).
 */
const intrinsicSize = (url) => {
  const markup = decodeDataUri(url);
  if (!markup) return null;

  const viewBox = markup.match(
    /viewBox=["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i
  );
  if (viewBox) {
    return { width: parseFloat(viewBox[1]), height: parseFloat(viewBox[2]) };
  }

  const width = markup.match(/\swidth=["']([\d.]+)/i);
  const height = markup.match(/\sheight=["']([\d.]+)/i);
  if (width && height) {
    return { width: parseFloat(width[1]), height: parseFloat(height[1]) };
  }

  return null;
};

/** Flat (non-isometric) icons are drawn on the ground plane. */
const projectFlatIcon = (position) => {
  const matrix = getIsoMatrix().join(', ');
  const x = position.x - PROJECTED_TILE_SIZE.width / 2;
  const y = position.y - PROJECTED_TILE_SIZE.height / 2;

  return { transform: `translate(${x}, ${y}) matrix(${matrix})` };
};

/**
 * Renders a diagram model to an SVG string — no DOM required.
 *
 * @param {object} model - Isoflow/FossFLOW JSON model
 * @param {object} [options]
 * @param {string} [options.viewId] - view to render (default: the first one)
 * @param {boolean} [options.showGrid=false] - draw the isometric grid
 * @param {string} [options.background] - CSS color, or 'transparent' (default)
 * @param {number} [options.margin=0.15] - padding around the content, in tiles
 * @param {Record<string, {width: number, height: number}>} [options.iconSizes]
 *   intrinsic size of each icon, keyed by icon id — needed to place artwork
 *   without a DOM to measure it. Defaults to a square tile.
 * @param {boolean} [options.inlineIcons=true] - inline SVG icon artwork as
 *   <symbol>/<use> instead of <image href="data:…">. Keeps the output truly
 *   vector and works with consumers that cannot decode nested data URIs
 *   (pdfmake, for one). Raster icons always fall back to <image>.
 * @returns {{ svg: string, width: number, height: number }}
 */
export const renderToSvg = (model, options = {}) => {
  const {
    viewId,
    showGrid = false,
    background,
    margin = 0.15,
    iconSizes = {},
    inlineIcons = true,
    theme: themeName = 'light'
  } = options;

  // Le rendu SVG sert surtout à l'export (PDF, documents) : le thème clair y
  // est le défaut raisonnable, et non la préférence du système de la machine
  // qui génère le document.
  const theme = resolveTheme(themeName);
  // `background` non fourni → transparent, pour ne pas plaquer un fond dans un
  // document. Un appelant qui veut le fond du thème passe `theme.background`.
  const backgroundColor = background ?? 'transparent';

  const parsed = modelSchema.parse({ ...INITIAL_DATA, ...model });
  const scene = deriveScene(parsed, viewId);

  // Only the icons this view actually uses: a model can carry a whole isopack
  // (1000+ icons), and inlining them all would bloat the output.
  const usedIconIds = new Set();
  scene.items.forEach((item) => {
    const modelItem = resolveModelItem(parsed, item.id);
    if (modelItem?.icon) usedIconIds.add(modelItem.icon);
  });

  const icons = {};
  const symbols = {};
  parsed.icons.forEach((icon) => {
    if (!usedIconIds.has(icon.id)) return;

    icons[icon.id] = iconSizes[icon.id] ??
      intrinsicSize(icon.url) ?? { width: 1, height: 1 };

    if (inlineIcons) {
      const symbol = iconSymbol(icon);
      if (symbol) symbols[icon.id] = symbol;
    }
  });

  const { minX, minY, width, height } = contentBounds(scene, parsed, icons, margin);

  const backgroundRect =
    backgroundColor && backgroundColor !== 'transparent'
      ? `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${escapeXml(backgroundColor)}"/>`
      : '';

  // The grid tile is inlined as vector geometry rather than referenced as a
  // data URI, for the same reason as the icons.
  const gridDefs = showGrid
    ? `<pattern id="iso-grid" patternUnits="userSpaceOnUse" ` +
      `width="${PROJECTED_TILE_SIZE.width}" height="${PROJECTED_TILE_SIZE.height * 2}" ` +
      `x="${-PROJECTED_TILE_SIZE.width / 2}" y="0">` +
      `<svg viewBox="${GRID_TILE_VIEWBOX}" width="${PROJECTED_TILE_SIZE.width}" ` +
      `height="${PROJECTED_TILE_SIZE.height * 2}">` +
      gridTileBody(theme.gridStroke, theme.gridOpacity) +
      `</svg>` +
      `</pattern>`
    : '';

  const symbolDefs = Object.entries(symbols)
    .map(([id, { viewBox, body }]) => {
      return `<symbol id="iso-icon-${escapeXml(id)}" viewBox="${escapeXml(viewBox)}">${body}</symbol>`;
    })
    .join('');

  const defs = gridDefs || symbolDefs ? `<defs>${gridDefs}${symbolDefs}</defs>` : '';

  const gridRect = showGrid
    ? `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#iso-grid)"/>`
    : '';

  // Le contenu est dessiné autour de l'origine du plan isométrique, donc à des
  // coordonnées largement négatives. Plutôt que de décaler le repère via un
  // viewBox négatif — que tous les consommateurs SVG ne gèrent pas (pdfmake
  // dessine alors comme si le contenu partait de (0,0), d'où un cadrage
  // décalé) — on garde un viewBox à l'origine et on translate le contenu.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    defs +
    `<g transform="translate(${-minX}, ${-minY})">` +
    backgroundRect +
    renderRectangles(scene) +
    gridRect +
    renderConnectors(scene, theme) +
    renderTextBoxes(scene, theme) +
    renderNodes(scene, parsed, icons, symbols) +
    renderConnectorLabels(scene, theme) +
    renderNodeLabels(scene, parsed, theme) +
    `</g>` +
    `</svg>`;

  return { svg, width, height };
};

/**
 * Encombrement réel du contenu d'une vue, en pixels de scène (zoom 1), et
 * position de son centre par rapport à l'origine du plan isométrique.
 *
 * C'est la même mesure que celle du rendu SVG : elle tient compte des
 * étiquettes, des icônes et du tracé réel des connecteurs, là où les bornes en
 * espace-tuiles (getUnprojectedBounds) surestiment largement — d'un facteur 3
 * sur un petit schéma, ce qui donnait un « ajuster à la vue » ridiculement
 * dézoomé.
 *
 * @param {object} model
 * @param {{ viewId?: string, margin?: number }} [options]
 * @returns {{ width: number, height: number, centre: { x: number, y: number } }}
 */
export const getContentBox = (model, options = {}) => {
  const { viewId, margin = 0.15 } = options;

  const parsed = modelSchema.parse({ ...INITIAL_DATA, ...model });
  const scene = deriveScene(parsed, viewId);

  const icons = {};
  parsed.icons.forEach((icon) => {
    icons[icon.id] = intrinsicSize(icon.url) ?? { width: 1, height: 1 };
  });

  const { minX, minY, width, height } = contentBounds(scene, parsed, icons, margin);

  return {
    width,
    height,
    centre: { x: minX + width / 2, y: minY + height / 2 }
  };
};

export { DIAGRAM_BACKGROUND_COLOR };
