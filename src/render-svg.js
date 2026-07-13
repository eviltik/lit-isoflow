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
import { GRID_TILE_VIEWBOX, GRID_TILE_BODY } from './assets/grid-tile.js';

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

const renderConnectors = (scene) => {
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
          `<polygon points="17.58,17.01 0,-17.01 -17.58,17.01" fill="black" stroke="#ffffff" stroke-width="4"/>` +
          `</g>`
        : '';

      // The component mirrors the connector <svg> along X (an upstream quirk:
      // path x-coordinates come out flipped). CSS mirrors about the element's
      // centre, so the SVG equivalent is a mirror about width/2.
      return (
        `<g transform="${transform} translate(${size.width / 2}, 0) scale(-1, 1) translate(${-size.width / 2}, 0)">` +
        `<polyline points="${points}" fill="none" stroke="#ffffff" ` +
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

const renderTextBoxes = (scene) => {
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
        `font-weight="${TEXTBOX_FONT_WEIGHT}" fill="#1c2430">` +
        escapeXml(textBox.content) +
        `</text></g>`
      );
    })
    .join('');
};

/** A white rounded label box with centred text lines, in screen space. */
const labelBox = (lines, x, y, anchor, extra = {}) => {
  const { fontSize = LABEL_FONT_SIZE, color = '#1c2430', bold = false } = extra;
  const width =
    Math.min(
      LABEL_MAX_WIDTH,
      Math.max(...lines.map((line) => textWidthPx(line, fontSize)))
    ) +
    LABEL_PADDING_X * 2;
  const height = lines.length * LABEL_LINE_HEIGHT + LABEL_PADDING_Y * 2;

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
    `fill="#ffffff" stroke="#bdbdbd" stroke-width="1"/>` +
    texts
  );
};

const renderConnectorLabels = (scene) => {
  return scene.connectors
    .map((connector) => {
      if (!connector.description) return '';

      const tile = connector.path.tiles[Math.floor(connector.path.tiles.length / 2)];
      if (!tile) return '';

      const position = getTilePosition({
        tile: connectorPathTileToGlobal(tile, connector.path.rectangle.from)
      });
      const lines = wrapText(connector.description, 150, LABEL_FONT_SIZE);

      return labelBox(lines, position.x, position.y, 'center', {
        fontSize: 10,
        color: '#666666'
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
  // so draw back-to-front (highest x+y first).
  const sorted = [...scene.items].sort((a, b) => {
    return b.tile.x + b.tile.y - (a.tile.x + a.tile.y);
  });

  return sorted
    .map((item) => {
      const modelItem = resolveModelItem(model, item.id);
      if (!modelItem) return '';

      const icon = resolveIcon(model, modelItem.icon);
      const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
      const labelHeight = item.labelHeight ?? DEFAULT_LABEL_HEIGHT;
      const labelAnchorY = PROJECTED_TILE_SIZE.height / 2;

      const description =
        modelItem.description && modelItem.description !== MARKDOWN_EMPTY_VALUE
          ? htmlToText(modelItem.description)
          : '';
      const lines = [];
      if (modelItem.name) lines.push(...wrapText(modelItem.name, LABEL_MAX_WIDTH, 11));
      if (description) lines.push(...wrapText(description, LABEL_MAX_WIDTH, 11));

      let parts = '';

      // The leader line is drawn first: the icon must cover its lower end,
      // as it does in the component (where the icon layer sits on top).
      if (lines.length > 0 && labelHeight > 0) {
        const labelY = position.y - labelAnchorY;

        parts +=
          `<line x1="${position.x}" y1="${labelY}" x2="${position.x}" y2="${labelY - labelHeight}" ` +
          `stroke="black" stroke-width="3" stroke-linecap="round" stroke-dasharray="0, 6"/>`;
      }

      if (icon && icons[icon.id]) {
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
          parts += `<g transform="${transform}">${artwork(0, 0)}</g>`;
        } else {
          parts += artwork(position.x - iconWidth / 2, position.y - iconHeight);
        }
      }

      if (lines.length > 0) {
        const labelY = position.y - labelAnchorY;

        parts += labelBox(lines, position.x, labelY - labelHeight, 'bottom', {
          bold: true
        });
      }

      return parts;
    })
    .join('');
};

/**
 * Bounds of the rendered content in screen space, computed rather than
 * measured — the DOM-based exportPng() measures the same thing with
 * getBoundingClientRect().
 */
const contentBounds = (scene, margin) => {
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

  /** The four projected corners of a tile-space surface. */
  const includeSurface = (from, to) => {
    getBoundingBox([from, to]).forEach((corner) => {
      const position = getTilePosition({ tile: corner });

      // A tile is a diamond: its own corners reach half a tile out.
      include(position.x - PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x + PROJECTED_TILE_SIZE.width / 2, position.y);
      include(position.x, position.y - PROJECTED_TILE_SIZE.height / 2);
      include(position.x, position.y + PROJECTED_TILE_SIZE.height / 2);
    });
  };

  scene.rectangles.forEach((rectangle) => {
    includeSurface(rectangle.from, rectangle.to);
  });

  scene.connectors.forEach((connector) => {
    includeSurface(connector.path.rectangle.from, connector.path.rectangle.to);
  });

  scene.textBoxes.forEach((textBox) => {
    includeSurface(textBox.tile, {
      x: textBox.tile.x + Math.ceil(textBox.size.width),
      y: textBox.tile.y
    });
  });

  scene.items.forEach((item) => {
    const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
    const iconWidth = PROJECTED_TILE_SIZE.width;
    const labelHeight = item.labelHeight ?? DEFAULT_LABEL_HEIGHT;

    // Icon artwork, drawn upwards from the tile's bottom anchor.
    include(position.x - iconWidth / 2, position.y);
    include(position.x + iconWidth / 2, position.y - iconWidth * 1.2);

    // Label box above the icon (its width is capped, height is a line or two).
    const labelTop =
      position.y - PROJECTED_TILE_SIZE.height / 2 - labelHeight - LABEL_LINE_HEIGHT * 2;
    include(position.x - LABEL_MAX_WIDTH / 2, labelTop);
    include(position.x + LABEL_MAX_WIDTH / 2, labelTop);
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
 * @param {number} [options.margin=0.5] - padding around the content, in tiles
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
    background = 'transparent',
    margin = 0.5,
    iconSizes = {},
    inlineIcons = true
  } = options;

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

  const { minX, minY, width, height } = contentBounds(scene, margin);

  const backgroundRect =
    background && background !== 'transparent'
      ? `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${escapeXml(background)}"/>`
      : '';

  // The grid tile is inlined as vector geometry rather than referenced as a
  // data URI, for the same reason as the icons.
  const gridDefs = showGrid
    ? `<pattern id="iso-grid" patternUnits="userSpaceOnUse" ` +
      `width="${PROJECTED_TILE_SIZE.width}" height="${PROJECTED_TILE_SIZE.height * 2}" ` +
      `x="${-PROJECTED_TILE_SIZE.width / 2}" y="0">` +
      `<svg viewBox="${GRID_TILE_VIEWBOX}" width="${PROJECTED_TILE_SIZE.width}" ` +
      `height="${PROJECTED_TILE_SIZE.height * 2}">${GRID_TILE_BODY}</svg>` +
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

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">` +
    defs +
    backgroundRect +
    renderRectangles(scene) +
    gridRect +
    renderConnectors(scene) +
    renderTextBoxes(scene) +
    renderConnectorLabels(scene) +
    renderNodes(scene, parsed, icons, symbols) +
    `</svg>`;

  return { svg, width, height };
};

export { DIAGRAM_BACKGROUND_COLOR };
