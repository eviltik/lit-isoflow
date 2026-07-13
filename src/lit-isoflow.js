/**
 * <lit-isoflow> — isometric diagram renderer and editor.
 *
 * Phase 1: read-only rendering (grid, nodes, connectors, rectangles,
 * text boxes, labels) with pan & zoom.
 * Phase 2: editing via interaction modes ported from Isoflow (select, drag,
 * draw connectors/rectangles, place icons, text boxes, transform anchors).
 *
 * Model format is interchangeable with Isoflow/FossFLOW JSON exports.
 * Layer order mirrors Isoflow's Renderer: rectangles < grid < cursor
 * < connectors < textBoxes < connectorLabels < nodes < transform controls.
 */
import { LitElement, html, svg, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { styleMap } from 'lit/directives/style-map.js';
import { repeat } from 'lit/directives/repeat.js';
import {
  PROJECTED_TILE_SIZE,
  UNPROJECTED_TILE_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LABEL_HEIGHT,
  TEXTBOX_PADDING,
  TEXTBOX_FONT_WEIGHT,
  TEXTBOX_DEFAULTS,
  TRANSFORM_ANCHOR_SIZE,
  MARKDOWN_EMPTY_VALUE,
  DEFAULT_STRINGS,
  MIN_ZOOM,
  MAX_FIT_ZOOM,
  INITIAL_DATA
} from './config.js';
import { modelSchema } from './schemas.js';
import { deriveScene, resolveColor, resolveModelItem, resolveIcon } from './scene.js';
import {
  getTilePosition,
  getBoundingBox,
  getIsoProjectionCss,
  getConnectorDirectionIcon,
  connectorPathTileToGlobal,
  getAnchorTile,
  getTextBoxEndTile,
  getMouse,
  incrementZoom,
  decrementZoom,
  convertBoundsToNamedAnchors,
  outermostCornerPositions
} from './utils/renderer.js';
import { getColorVariant, toPx, generateId, clamp } from './utils/common.js';
import { renderToSvg, getContentBox } from './render-svg.js';
import { interactionModes } from './editor/modes.js';
import * as mutations from './editor/mutations.js';
import { gridTileDataUri } from './assets/grid-tile.js';
import { resolveTheme } from './theme.js';

/**
 * How far outside the viewport a node still counts as visible, in unzoomed
 * scene pixels. Covers the widest label (250 px, see .label in the styles) and
 * the tallest icon-plus-label stack, so nothing pops out while still on screen.
 */
const CULL_PADDING = { x: 300, y: 400 };

const getStartingMode = (editorMode) => {
  switch (editorMode) {
    case 'EDITABLE':
      return { type: 'CURSOR', showCursor: true, mousedownItem: null };
    case 'EXPLORABLE_READONLY':
      return { type: 'PAN', showCursor: false };
    case 'NON_INTERACTIVE':
    default:
      return { type: 'INTERACTIONS_DISABLED', showCursor: false };
  }
};

// Lit leaves template marker comments in the DOM; they are dropped before
// XML serialization for the PNG export.
const stripComments = (node) => {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) child.remove();
    else stripComments(child);
  }
};

const INITIAL_MOUSE = {
  position: { screen: { x: 0, y: 0 }, tile: { x: 0, y: 0 } },
  mousedown: null,
  delta: null
};

export class LitIsoflow extends LitElement {
  static properties = {
    /** Diagram model (Isoflow/FossFLOW JSON). */
    model: { type: Object },
    /** View to display; defaults to the model's first view. */
    viewId: { type: String, attribute: 'view-id' },
    /** 'EDITABLE', 'EXPLORABLE_READONLY' (pan/zoom) or 'NON_INTERACTIVE'. */
    editorMode: { type: String, attribute: 'editor-mode' },
    showGrid: { type: Boolean, attribute: 'show-grid' },
    backgroundColor: { type: String, attribute: 'background-color' },
    /** Fit the whole view in the viewport once on load. */
    fitToView: { type: Boolean, attribute: 'fit-to-view' },
    /**
     * Overrides for the component's own strings (see DEFAULT_STRINGS).
     * The host app owns every other label, so this is the whole i18n surface.
     */
    strings: { type: Object },
    /**
     * 'auto' (suit prefers-color-scheme), 'light' ou 'dark'. Seul le décor
     * change — fond, grille, étiquettes : les couleurs des éléments viennent du
     * modèle et appartiennent au diagramme.
     */
    theme: { type: String, reflect: true },

    _zoom: { state: true },
    _scroll: { state: true },
    _animated: { state: true },
    _modelError: { state: true },
    _mode: { state: true },
    _itemControls: { state: true },
    _cursorCss: { state: true }
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      font-family: Roboto, Arial, sans-serif;
      contain: strict;
    }

    .container {
      position: absolute;
      inset: 0;
      overflow: hidden;
      transform: translateZ(0);
      user-select: none;
      touch-action: none;
    }

    .grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image: var(--grid-tile);
      background-repeat: repeat;
    }

    .scene-layer {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      user-select: none;
      pointer-events: none;
    }

    .animated .scene-layer {
      transition: transform 0.25s ease-out;
    }

    .animated .grid {
      transition:
        background-size 0.25s ease-out,
        background-position 0.25s ease-out;
    }

    .scene-layer.controls {
      pointer-events: none;
    }

    .transform-anchor {
      pointer-events: auto;
      cursor: pointer;
    }

    .projected {
      position: absolute;
      transform-origin: top left;
    }

    .node {
      position: absolute;
    }

    .node-anchor {
      position: absolute;
    }

    .node-icon {
      position: absolute;
      pointer-events: none;
      transform: translate(-50%, -100%);
    }

    .node-icon-flat-wrapper {
      position: absolute;
      pointer-events: none;
      transform-origin: top left;
    }

    .node-icon-flat-wrapper img {
      display: block;
    }

    .label-line {
      position: absolute;
      pointer-events: none;
    }

    .label-box {
      position: absolute;
      transform: translate(-50%, -100%);
      background: var(--iso-label-bg);
      border: 1px solid var(--iso-label-border);
      color: var(--iso-label-text);
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 250px;
      width: max-content;
      box-sizing: border-box;
      font-size: 0.85em;
      line-height: 1.2;
      overflow: hidden;
    }

    .label-box .name {
      font-weight: 600;
    }

    .label-box .description {
      margin-top: 8px;
      color: var(--iso-label-muted);
    }

    .label-box .description p {
      margin: 0;
    }

    .connector-label {
      position: absolute;
      pointer-events: none;
    }

    .connector-label .label-box {
      transform: translate(-50%, -50%);
      max-width: 150px;
      padding: 6px 8px;
      font-size: 0.75em;
      color: var(--iso-label-muted);
    }

    .textbox {
      position: absolute;
      top: 0;
      left: 0;
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .error {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--iso-error);
      font-size: 14px;
      padding: 16px;
      text-align: center;
    }
  `;

  constructor() {
    super();
    this.model = null;
    this.viewId = '';
    this.editorMode = 'EXPLORABLE_READONLY';
    this.showGrid = true;
    this.backgroundColor = '';
    this.fitToView = false;
    this.strings = {};
    this.theme = 'auto';

    // En thème `auto`, un changement de préférence système doit repeindre.
    this._colorScheme =
      typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(prefers-color-scheme: dark)')
        : null;
    this._onColorSchemeChange = () => {
      if (this.theme === 'auto') this.requestUpdate();
    };

    this._zoom = 1;
    this._scroll = { x: 0, y: 0 };
    this._animated = true;
    this._modelError = null;
    this._mode = getStartingMode(this.editorMode);
    this._itemControls = null;
    this._cursorCss = 'default';

    this._scene = null;
    this._workingModel = null;
    this._mouse = INITIAL_MOUSE;
    this._prevModeType = null;
    this._hasFitted = false;
    this._modelUpdateTimer = null;
    this._undoStack = [];
    this._redoStack = [];
    this._historyOpen = false;

    this._onWindowMouseEvent = this._handleMouseEvent.bind(this);
    this._onWindowTouchStart = this._makeTouchHandler('mousedown');
    this._onWindowTouchMove = this._makeTouchHandler('mousemove');
    this._onWindowTouchEnd = (event) => {
      this._handleMouseEvent({
        clientX: 0,
        clientY: 0,
        type: 'mouseup',
        target: event.target,
        composedPath: () => event.composedPath()
      });
    };
    this._onWindowKeyDown = this._handleKeyDown.bind(this);
    this._onWindowKeyUp = this._handleKeyUp.bind(this);
    this._onWindowBlur = () => {
      this._endTransientPan();
    };
    this._modeBeforePan = null;

    this._lastSize = null;
    this._resizeObserver = new ResizeObserver(() => {
      const size = { width: this.clientWidth, height: this.clientHeight };

      // Scene layers are anchored at the container's center: without
      // compensation, any host-driven resize (side drawer opening, window
      // resize) shifts the whole diagram by half the size delta.
      if (this._lastSize && this._scene) {
        const deltaX = (size.width - this._lastSize.width) / 2;
        const deltaY = (size.height - this._lastSize.height) / 2;

        if (deltaX !== 0 || deltaY !== 0) {
          this._animated = false;
          this._scroll = {
            x: this._scroll.x - deltaX,
            y: this._scroll.y - deltaY
          };
        }
      }

      this._lastSize = size;
      this.requestUpdate();
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._resizeObserver.observe(this);
    this._colorScheme?.addEventListener('change', this._onColorSchemeChange);
    window.addEventListener('mousemove', this._onWindowMouseEvent);
    window.addEventListener('mousedown', this._onWindowMouseEvent);
    window.addEventListener('mouseup', this._onWindowMouseEvent);
    window.addEventListener('touchstart', this._onWindowTouchStart);
    window.addEventListener('touchmove', this._onWindowTouchMove);
    window.addEventListener('touchend', this._onWindowTouchEnd);
    window.addEventListener('keydown', this._onWindowKeyDown);
    window.addEventListener('keyup', this._onWindowKeyUp);
    window.addEventListener('blur', this._onWindowBlur);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
    this._colorScheme?.removeEventListener('change', this._onColorSchemeChange);
    window.removeEventListener('mousemove', this._onWindowMouseEvent);
    window.removeEventListener('mousedown', this._onWindowMouseEvent);
    window.removeEventListener('mouseup', this._onWindowMouseEvent);
    window.removeEventListener('touchstart', this._onWindowTouchStart);
    window.removeEventListener('touchmove', this._onWindowTouchMove);
    window.removeEventListener('touchend', this._onWindowTouchEnd);
    window.removeEventListener('keydown', this._onWindowKeyDown);
    window.removeEventListener('keyup', this._onWindowKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    clearTimeout(this._modelUpdateTimer);
  }

  willUpdate(changed) {
    if (changed.has('model') || changed.has('viewId')) {
      this._ingestModel();
    }

    if (changed.has('editorMode')) {
      this._mode = getStartingMode(this.editorMode);
      this._itemControls = null;
      this._cursorCss = 'default';
      this._prevModeType = null;
    }
  }

  updated(changed) {
    if ((changed.has('model') || changed.has('viewId')) && this._scene) {
      if (this.fitToView && !this._hasFitted) {
        this._hasFitted = true;
        this.fit();
      }
      this.dispatchEvent(
        new CustomEvent('diagram-ready', { bubbles: true, composed: true })
      );
    }
  }

  /** The component's strings, with the host's overrides applied. */
  get _strings() {
    return { ...DEFAULT_STRINGS, ...this.strings };
  }

  /** La palette du décor, résolue depuis la propriété `theme`. */
  get _theme() {
    return resolveTheme(this.theme);
  }

  // --- public API ---

  /** Zooms in one increment (same steps as Isoflow). */
  zoomIn() {
    this._setZoom(incrementZoom(this._zoom));
  }

  /** Zooms out one increment. */
  zoomOut() {
    this._setZoom(decrementZoom(this._zoom));
  }

  /** Fits the current view inside the viewport. */
  fit() {
    if (!this._scene || !this._workingModel) return;

    const viewport = {
      width: this.clientWidth || 1,
      height: this.clientHeight || 1
    };

    // On mesure le contenu réellement dessiné (étiquettes, icônes, tracé des
    // connecteurs), et non la bounding box en espace-tuiles : celle-ci
    // surestime d'un facteur ~3, ce qui laissait le schéma minuscule.
    const content = getContentBox(this._workingModel, {
      viewId: this.viewId || undefined
    });

    const zoom = clamp(
      Math.min(viewport.width / content.width, viewport.height / content.height),
      MIN_ZOOM,
      MAX_FIT_ZOOM
    );

    // Les couches de scène sont ancrées au centre du conteneur : amener le
    // centre du contenu au centre de la vue revient à le décaler de -centre.
    this._animated = true;
    this._zoom = zoom;
    this._scroll = {
      x: -content.centre.x * zoom,
      y: -content.centre.y * zoom
    };
    this._emitZoom();
  }

  /** Returns a deep snapshot of the current (possibly edited) model. */
  getModel() {
    return this._workingModel ? structuredClone(this._workingModel) : null;
  }

  get canUndo() {
    return this._undoStack.length > 0;
  }

  get canRedo() {
    return this._redoStack.length > 0;
  }

  /** Undoes the last edit gesture (also bound to Ctrl+Z). */
  undo() {
    if (!this.canUndo) return;

    this._redoStack.push(structuredClone(this._workingModel));
    this._workingModel = this._undoStack.pop();
    this._historyOpen = false;
    this._itemControls = null;
    this._afterHistoryChange();
  }

  /** Redoes the last undone edit gesture (also bound to Ctrl+Y / Ctrl+Shift+Z). */
  redo() {
    if (!this.canRedo) return;

    this._undoStack.push(structuredClone(this._workingModel));
    this._workingModel = this._redoStack.pop();
    this._historyOpen = false;
    this._itemControls = null;
    this._afterHistoryChange();
  }

  _afterHistoryChange() {
    this._resyncScene();
    this.requestUpdate();
    clearTimeout(this._modelUpdateTimer);
    this.dispatchEvent(
      new CustomEvent('model-updated', {
        detail: { model: this.getModel() },
        bubbles: true,
        composed: true
      })
    );
    this._emitHistoryChanged();
  }

  _emitHistoryChanged() {
    this.dispatchEvent(
      new CustomEvent('history-changed', {
        detail: { canUndo: this.canUndo, canRedo: this.canRedo },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Opens an undo step on the first mutation of a gesture: everything until
   * the next mouseup (or a 250 ms pause) collapses into one history entry.
   */
  _beforeMutation() {
    if (this._historyOpen) return;

    this._undoStack.push(structuredClone(this._workingModel));
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
    this._historyOpen = true;
    this._emitHistoryChanged();
  }

  /** Currently active tool, derived from the interaction mode. */
  get tool() {
    switch (this._mode.type) {
      case 'CURSOR':
      case 'DRAG_ITEMS':
        return 'CURSOR';
      case 'RECTANGLE.DRAW':
      case 'RECTANGLE.TRANSFORM':
        return 'RECTANGLE';
      case 'TEXTBOX':
        return 'TEXTBOX';
      default:
        return this._mode.type;
    }
  }

  /**
   * Activates an editing tool (requires editorMode = 'EDITABLE').
   * @param {'CURSOR'|'PAN'|'PLACE_ICON'|'CONNECTOR'|'RECTANGLE'|'TEXTBOX'} tool
   * @param {{ iconId?: string }} [options] - PLACE_ICON: icon to stamp
   */
  setTool(tool, options = {}) {
    if (this.editorMode !== 'EDITABLE' || !this._scene) return;

    switch (tool) {
      case 'CURSOR':
        this._setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
        break;
      case 'PAN':
        this._setMode({ type: 'PAN', showCursor: false });
        this._setItemControls(null);
        break;
      case 'PLACE_ICON':
        this._setMode({
          type: 'PLACE_ICON',
          showCursor: true,
          id: options.iconId ?? null
        });
        break;
      case 'CONNECTOR':
        this._setMode({ type: 'CONNECTOR', showCursor: true, id: null });
        break;
      case 'RECTANGLE':
        this._setMode({ type: 'RECTANGLE.DRAW', showCursor: true, id: null });
        break;
      case 'TEXTBOX': {
        const textBoxId = generateId();

        this._sceneFacade().createTextBox({
          ...TEXTBOX_DEFAULTS,
          id: textBoxId,
          tile: this._mouse.position.tile
        });
        this._setMode({ type: 'TEXTBOX', showCursor: false, id: textBoxId });
        break;
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    this.dispatchEvent(
      new CustomEvent('tool-changed', {
        detail: { tool: this.tool },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * Full data for the current selection, for property panels:
   * ITEM → { type, id, modelItem, viewItem }, others → { type, id, connector|rectangle|textBox }.
   * Returns a deep copy; feed changes back through the update* methods.
   */
  getSelectedItem() {
    if (!this._itemControls || !this._workingModel || !this._scene) return null;

    const { type, id } = this._itemControls;
    const view = this._scene.view;

    const find = (arr) => {
      return (arr ?? []).find((entry) => {
        return entry.id === id;
      });
    };

    let selected = null;
    if (type === 'ITEM') {
      selected = {
        type,
        id,
        modelItem: find(this._workingModel.items),
        viewItem: find(view.items)
      };
    } else if (type === 'CONNECTOR') {
      selected = { type, id, connector: find(view.connectors) };
    } else if (type === 'RECTANGLE') {
      selected = { type, id, rectangle: find(view.rectangles) };
    } else if (type === 'TEXTBOX') {
      selected = { type, id, textBox: find(view.textBoxes) };
    }

    return selected ? structuredClone(selected) : null;
  }

  /** Updates a model item's properties (name, description as HTML, icon id). */
  updateItem(id, updates) {
    if (!this._scene) return;
    this._sceneFacade().updateModelItem(id, updates);
  }

  /** Updates a view item (tile, labelHeight). */
  updateViewItem(id, updates) {
    if (!this._scene) return;
    this._sceneFacade().updateViewItem(id, updates);
  }

  /** Updates a connector (description, color id, style, width, anchors). */
  updateConnector(id, updates) {
    if (!this._scene) return;
    this._sceneFacade().updateConnector(id, updates);
  }

  /** Updates a rectangle (color id, from, to). */
  updateRectangle(id, updates) {
    if (!this._scene) return;
    this._sceneFacade().updateRectangle(id, updates);
  }

  /**
   * Creates a rectangle spanning the tiles `from` → `to`.
   *
   * Until now zones could only be drawn with the mouse, which left a host with
   * no way to place one programmatically (importing, templating, generating).
   *
   * @param {{ from: Coords, to: Coords, color?: string, id?: string }} rectangle
   * @returns {string | undefined} the id of the new rectangle
   */
  createRectangle({ from, to, color, id = generateId() }) {
    if (!this._scene) return undefined;

    this._sceneFacade().createRectangle({
      id,
      color: color ?? this._scene.colors[0]?.id,
      from,
      to
    });

    return id;
  }

  /** Deletes a rectangle. */
  deleteRectangle(id) {
    if (!this._scene) return;
    this._sceneFacade().deleteRectangle(id);
  }

  /** Updates a text box (content, fontSize, orientation, tile). */
  updateTextBox(id, updates) {
    if (!this._scene) return;
    this._sceneFacade().updateTextBox(id, updates);
  }

  /**
   * Renders the current view to an SVG string. Thin wrapper around
   * renderToSvg() — which is pure JS and also usable without a DOM, e.g. in a
   * CLI or a PDF pipeline.
   *
   * @param {{ showGrid?: boolean, background?: string, margin?: number }} [options]
   * @returns {{ svg: string, width: number, height: number }}
   */
  exportSvg(options = {}) {
    if (!this._workingModel) throw new Error('No model loaded.');

    return renderToSvg(this._workingModel, {
      viewId: this.viewId || undefined,
      background: this.backgroundColor || 'transparent',
      // Le SVG exporté reprend le thème affiché, sauf mention contraire.
      theme: this.theme,
      ...options
    });
  }

  /**
   * Renders the current view to a PNG, without any dependency: a
   * NON_INTERACTIVE clone is laid out at the diagram's bounds, serialized
   * into an SVG <foreignObject> and rasterized on a canvas.
   *
   * Icon URLs must be data URIs or same-origin (external images would
   * taint the canvas); text renders with locally available fonts.
   *
   * @param {{ scale?: number, showGrid?: boolean, background?: string, margin?: number }} [options]
   *   scale: pixel density multiplier (default 2);
   *   background: any CSS color, including 'transparent';
   *   margin: padding around the content, in tiles (default 0.15).
   * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number }>}
   */
  async exportPng({
    scale = 2,
    showGrid = false,
    background,
    margin = 0.15,
    theme
  } = {}) {
    if (!this._scene) throw new Error('No model loaded.');

    // Taille du contenu réellement dessiné ; le clone est ensuite resserré au
    // pixel près par mesure du DOM (les métriques de texte du navigateur sont
    // plus fines que notre estimation).
    const content = getContentBox(this._workingModel, {
      viewId: this.viewId || undefined,
      margin
    });
    let width = content.width;
    let height = content.height;

    const clone = document.createElement('lit-isoflow');
    clone.editorMode = 'NON_INTERACTIVE';
    clone.showGrid = showGrid;
    clone.backgroundColor = background ?? this.backgroundColor;
    clone.theme = theme ?? this.theme;
    clone.viewId = this.viewId;
    clone.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;`;
    clone.model = this.getModel();
    document.body.appendChild(clone);

    const settle = async () => {
      await clone.updateComplete;
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    };

    try {
      await clone.updateComplete;
      clone._animated = false;
      clone._zoom = 1;
      // Centre du contenu ramené au centre du clone (couches ancrées au centre).
      clone._scroll = {
        x: -content.centre.x,
        y: -content.centre.y
      };
      await settle();

      // Icons must be decoded before measuring: their height depends on it.
      await Promise.all(
        [...clone.shadowRoot.querySelectorAll('img')].map((img) => {
          return img.decode().catch(() => {});
        })
      );
      await settle();

      // 2. Tight crop: union of every rendered scene element, plus margin.
      const cloneRect = clone.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      clone.shadowRoot.querySelectorAll('.scene-layer *').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        minX = Math.min(minX, rect.left - cloneRect.left);
        minY = Math.min(minY, rect.top - cloneRect.top);
        maxX = Math.max(maxX, rect.right - cloneRect.left);
        maxY = Math.max(maxY, rect.bottom - cloneRect.top);
      });

      if (minX !== Infinity) {
        const pad = margin * UNPROJECTED_TILE_SIZE;
        const newWidth = Math.ceil(maxX - minX + pad * 2);
        const newHeight = Math.ceil(maxY - minY + pad * 2);

        clone._scroll = {
          x: clone._scroll.x + width / 2 - newWidth / 2 + (pad - minX),
          y: clone._scroll.y + height / 2 - newHeight / 2 + (pad - minY)
        };
        width = newWidth;
        height = newHeight;
        // The scroll above already accounts for the size change: disarm the
        // ResizeObserver compensation so it does not apply a second time.
        clone._lastSize = null;
        clone.style.width = `${width}px`;
        clone.style.height = `${height}px`;
        await settle();
      }

      // 3. Serialize the shadow content (component styles inlined, since
      // adopted stylesheets do not survive serialization).
      const container = clone.shadowRoot.querySelector('.container');
      const snapshot = container.cloneNode(true);
      stripComments(snapshot);

      const wrapper = document.createElement('div');
      wrapper.setAttribute(
        'style',
        `position:relative;overflow:hidden;width:${width}px;height:${height}px;font-family:${DEFAULT_FONT_FAMILY};font-size:13px;`
      );
      const styleEl = document.createElement('style');
      styleEl.textContent = LitIsoflow.styles.cssText;
      wrapper.append(styleEl, snapshot);

      const xhtml = new XMLSerializer().serializeToString(wrapper);
      const svgMarkup =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;

      // 4. Rasterize.
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);

      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('PNG export failed.'));
        }, 'image/png');
      });

      return { blob, dataUrl, width: canvas.width, height: canvas.height };
    } finally {
      clone.remove();
    }
  }

  /**
   * Clears the selection (and emits `item-selected` with a null item), so a
   * host can close its property panel without reaching into internals.
   */
  clearSelection() {
    if (!this._itemControls) return;

    this._setItemControls(null);
  }

  /** Deletes the currently selected item (also bound to the Delete key). */
  deleteSelection() {
    if (!this._itemControls || !this._workingModel) return;

    const { type, id } = this._itemControls;
    const scene = this._sceneFacade();

    if (type === 'ITEM') scene.deleteViewItem(id);
    else if (type === 'CONNECTOR') scene.deleteConnector(id);
    else if (type === 'RECTANGLE') scene.deleteRectangle(id);
    else if (type === 'TEXTBOX') scene.deleteTextBox(id);

    this._setItemControls(null);
  }

  // --- model / scene management ---

  _ingestModel() {
    this._modelError = null;
    this._scene = null;
    this._workingModel = null;
    this._itemControls = null;
    this._mode = getStartingMode(this.editorMode);
    this._prevModeType = null;
    this._undoStack = [];
    this._redoStack = [];
    this._historyOpen = false;

    if (!this.model) return;

    const candidate = { ...INITIAL_DATA, ...this.model };
    const result = modelSchema.safeParse(candidate);

    if (!result.success) {
      const details = result.error.issues
        .map((issue) => {
          return `${issue.path.join('.')}: ${issue.message}`;
        })
        .join(' — ');
      this._modelError = `${this._strings.invalidModel} — ${details}`;
      this.dispatchEvent(
        new CustomEvent('model-error', {
          detail: { error: result.error },
          bubbles: true,
          composed: true
        })
      );
      return;
    }

    try {
      this._workingModel = structuredClone(result.data);
      this._resyncScene();
    } catch (error) {
      this._modelError = error.message;
    }
  }

  _resyncScene() {
    this._scene = deriveScene(this._workingModel, this.viewId || undefined);
  }

  _afterMutation() {
    this._resyncScene();
    this.requestUpdate();

    clearTimeout(this._modelUpdateTimer);
    this._modelUpdateTimer = setTimeout(() => {
      this._historyOpen = false;
      this.dispatchEvent(
        new CustomEvent('model-updated', {
          detail: { model: this.getModel() },
          bubbles: true,
          composed: true
        })
      );
    }, 250);
  }

  /**
   * Scene facade handed to interaction modes: derived scene data plus
   * mutation methods bound to the working model (mirrors Isoflow's useScene).
   */
  _sceneFacade() {
    const self = this;
    const viewId = this._scene.view.id;

    const mutate = (fn, ...args) => {
      self._beforeMutation();
      fn(self._workingModel, viewId, ...args);
      self._afterMutation();
    };

    return {
      get items() {
        return self._scene.items;
      },
      get connectors() {
        return self._scene.connectors;
      },
      get rectangles() {
        return self._scene.rectangles;
      },
      get textBoxes() {
        return self._scene.textBoxes;
      },
      get colors() {
        return self._scene.colors;
      },
      get currentView() {
        return self._scene.view;
      },
      get strings() {
        return self._strings;
      },
      createViewItem: (item) => {
        return mutate(mutations.createViewItem, item);
      },
      updateViewItem: (id, updates) => {
        return mutate(mutations.updateViewItem, id, updates);
      },
      deleteViewItem: (id) => {
        return mutate(mutations.deleteViewItem, id);
      },
      createModelItem: (item) => {
        self._beforeMutation();
        mutations.createModelItem(self._workingModel, item);
        self._afterMutation();
      },
      updateModelItem: (id, updates) => {
        self._beforeMutation();
        mutations.updateModelItem(self._workingModel, id, updates);
        self._afterMutation();
      },
      createConnector: (connector) => {
        return mutate(mutations.createConnector, connector);
      },
      updateConnector: (id, updates) => {
        return mutate(mutations.updateConnector, id, updates);
      },
      deleteConnector: (id) => {
        return mutate(mutations.deleteConnector, id);
      },
      createRectangle: (rectangle) => {
        return mutate(mutations.createRectangle, rectangle);
      },
      updateRectangle: (id, updates) => {
        return mutate(mutations.updateRectangle, id, updates);
      },
      deleteRectangle: (id) => {
        return mutate(mutations.deleteRectangle, id);
      },
      createTextBox: (textBox) => {
        return mutate(mutations.createTextBox, textBox);
      },
      updateTextBox: (id, updates) => {
        return mutate(mutations.updateTextBox, id, updates);
      },
      deleteTextBox: (id) => {
        return mutate(mutations.deleteTextBox, id);
      },
      changeLayerOrder: (payload) => {
        return mutate(mutations.changeLayerOrder, payload);
      }
    };
  }

  // --- interaction pipeline ---

  _uiStateFacade() {
    const self = this;

    return {
      get mode() {
        return self._mode;
      },
      get mouse() {
        return self._mouse;
      },
      get scroll() {
        return { position: self._scroll };
      },
      get itemControls() {
        return self._itemControls;
      },
      actions: {
        setMode: (mode) => {
          self._mode = mode;
        },
        setScroll: ({ position }) => {
          self._animated = false;
          self._scroll = position;
        },
        setItemControls: (itemControls) => {
          self._setItemControls(itemControls);
        },
        setCursor: (cursor) => {
          self._cursorCss = cursor;
        }
      }
    };
  }

  _makeTouchHandler(type) {
    return (event) => {
      if (!event.touches?.[0]) return;

      this._handleMouseEvent({
        clientX: Math.floor(event.touches[0].clientX),
        clientY: Math.floor(event.touches[0].clientY),
        type,
        target: event.target,
        composedPath: () => event.composedPath()
      });
    };
  }

  _handleMouseEvent(event) {
    if (!this._scene || this._mode.type === 'INTERACTIONS_DISABLED') return;

    const mode = interactionModes[this._mode.type];
    if (!mode) return;

    const modeFunction = mode[event.type];

    this._mouse = getMouse({
      interactiveElement: this,
      zoom: this._zoom,
      scroll: { position: this._scroll },
      lastMouse: this._mouse,
      mouseEvent: event,
      rendererSize: { width: this.clientWidth, height: this.clientHeight }
    });

    const state = {
      uiState: this._uiStateFacade(),
      scene: this._sceneFacade(),
      isRendererInteraction: event.composedPath
        ? event.composedPath().includes(this)
        : event.target === this
    };

    const modeTypeAtStart = this._mode.type;

    if (this._prevModeType !== modeTypeAtStart) {
      const prevMode = this._prevModeType ? interactionModes[this._prevModeType] : null;

      prevMode?.exit?.(state);
      mode.entry?.(state);
    }

    modeFunction?.(state);
    // Mode changes made BY the mode function are picked up on the next event
    // (entry/exit run then), matching Isoflow's interaction manager.
    this._prevModeType = modeTypeAtStart;

    if (event.type === 'mouseup') {
      this._historyOpen = false;
    }

    this.requestUpdate();
  }

  _handleKeyDown(event) {
    if (this.editorMode !== 'EDITABLE') return;

    // Resolve the real focused element through nested shadow roots:
    // document.activeElement only yields the outermost host (e.g. a
    // Web Awesome input would report as WA-INPUT, hiding its inner <input>).
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    )
      return;

    // Hold Shift or Space for a transient pan: the current tool is restored
    // on release. Ignored mid-drag and when a modifier shortcut is involved.
    if (
      (event.key === 'Shift' || event.key === ' ') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !this._modeBeforePan &&
      !this._mouse.mousedown &&
      this._mode.type !== 'PAN' &&
      this._mode.type !== 'INTERACTIONS_DISABLED'
    ) {
      if (event.key === ' ') event.preventDefault();
      this._modeBeforePan = this._mode;
      this._setMode({ type: 'PAN', showCursor: false });
      this.requestUpdate();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    if (event.key === 'Escape' && this._itemControls) {
      event.preventDefault();
      this.clearSelection();
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && this._itemControls) {
      event.preventDefault();
      this.deleteSelection();
    }
  }

  _handleKeyUp(event) {
    if (event.key === 'Shift' || event.key === ' ') {
      this._endTransientPan();
    }
  }

  _endTransientPan() {
    if (!this._modeBeforePan) return;

    const restored = this._modeBeforePan;
    this._modeBeforePan = null;
    this._setMode({ ...restored });
    this.requestUpdate();
  }

  _setMode(mode) {
    const state = {
      uiState: this._uiStateFacade(),
      scene: this._sceneFacade(),
      isRendererInteraction: true
    };

    if (this._prevModeType && this._prevModeType !== mode.type) {
      interactionModes[this._prevModeType]?.exit?.(state);
    }

    this._mode = mode;
    interactionModes[mode.type]?.entry?.(state);
    this._prevModeType = mode.type;
  }

  _setItemControls(itemControls) {
    this._itemControls = itemControls;
    this.dispatchEvent(
      new CustomEvent('item-selected', {
        detail: { item: itemControls },
        bubbles: true,
        composed: true
      })
    );
  }

  _setZoom(zoom) {
    if (zoom === this._zoom) return;

    this._animated = true;
    this._zoom = zoom;
    this._emitZoom();
  }

  _emitZoom() {
    this.dispatchEvent(
      new CustomEvent('zoom-changed', {
        detail: { zoom: this._zoom },
        bubbles: true,
        composed: true
      })
    );
  }

  _onWheel(event) {
    if (this._mode.type === 'INTERACTIONS_DISABLED') return;

    event.preventDefault();
    this._setZoom(
      event.deltaY > 0 ? decrementZoom(this._zoom) : incrementZoom(this._zoom)
    );
  }

  // --- rendering ---

  /**
   * CSS for an isometrically projected surface spanning [from, to],
   * port of Isoflow's useIsoProjection.
   */
  _projectionStyles(from, to, orientation) {
    const gridSize = {
      width: Math.abs(from.x - to.x) + 1,
      height: Math.abs(from.y - to.y) + 1
    };
    const boundingBox = getBoundingBox([from, to]);
    const origin = boundingBox[3];
    const position = getTilePosition({
      tile: origin,
      origin: orientation === 'Y' ? 'TOP' : 'LEFT'
    });
    const pxSize = {
      width: gridSize.width * UNPROJECTED_TILE_SIZE,
      height: gridSize.height * UNPROJECTED_TILE_SIZE
    };

    return {
      styles: {
        left: toPx(position.x),
        top: toPx(position.y),
        width: toPx(pxSize.width),
        height: toPx(pxSize.height),
        transform: getIsoProjectionCss(orientation)
      },
      pxSize
    };
  }

  /**
   * The slice of the scene currently on screen, in unzoomed scene pixels.
   *
   * A `.scene-layer` is anchored at the centre of the viewport (top/left: 50%)
   * and then transformed by `translate(scroll) scale(zoom)`. So a scene point p
   * lands on screen at `centre + scroll + p × zoom`; inverting that gives the
   * visible rectangle in scene coordinates.
   *
   * This lives here, in the DOM component, and NOT in scene.js or renderer.js:
   * those are shared with the headless SVG renderer (the one md2pdf uses to put
   * diagrams in PDFs), where there is no viewport at all. Culling there would
   * export an empty diagram.
   *
   * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
   *   null when the viewport is not measured yet — render everything rather than
   *   guess, since guessing wrong means showing nothing.
   */
  _viewportBounds() {
    const size = this._lastSize;
    if (!size?.width || !size?.height) return null;

    const zoom = this._zoom;
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    // A node's position is its anchor point, but what it *paints* spills well
    // beyond it: the icon reaches up from the anchor, and above that sits a
    // label up to 250 px wide (the .label max-width in this component's CSS).
    // Cull on the anchor alone and nodes would pop out while still half on
    // screen. The padding is deliberately generous — being too wide costs a few
    // nodes nobody sees, being too tight makes visible ones vanish.
    const padX = CULL_PADDING.x;
    const padY = CULL_PADDING.y;

    return {
      minX: (-halfW - this._scroll.x) / zoom - padX,
      maxX: (halfW - this._scroll.x) / zoom + padX,
      minY: (-halfH - this._scroll.y) / zoom - padY,
      maxY: (halfH - this._scroll.y) / zoom + padY
    };
  }

  /** Is this tile's node worth mounting? */
  _isVisible(tile, bounds) {
    if (!bounds) return true;

    const { x, y } = getTilePosition({ tile, origin: 'BOTTOM' });

    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }

  render() {
    if (this._modelError) {
      return html`<div
        class="error"
        style=${styleMap({ '--iso-error': this._theme.errorText })}
      >
        ${this._modelError}
      </div>`;
    }

    if (!this._scene) return nothing;

    const layerTransform = `translate(${this._scroll.x}px, ${this._scroll.y}px) scale(${this._zoom})`;
    const layerStyles = { transform: layerTransform };

    const theme = this._theme;

    // Nodes are the bulk of the DOM (roughly nine elements each, more with a
    // label), so only the ones on screen are mounted. The reverse() is the
    // isometric painter's order — near nodes must be drawn over far ones — and
    // has to survive the filtering.
    const bounds = this._viewportBounds();
    const visibleItems = [...this._scene.items].reverse().filter((item) => {
      return this._isVisible(item.tile, bounds);
    });

    return html`
      <div
        class="container ${this._animated ? 'animated' : ''}"
        style=${styleMap({
          backgroundColor: this.backgroundColor || theme.background,
          cursor: this._cursorCss,
          // Le CSS du shadow DOM lit le thème par ces variables.
          '--iso-label-bg': theme.labelBackground,
          '--iso-label-border': theme.labelBorder,
          '--iso-label-text': theme.labelText,
          '--iso-label-muted': theme.labelMutedText,
          '--iso-error': theme.errorText
        })}
        @wheel=${this._onWheel}
      >
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${this._scene.rectangles.map((rectangle) => {
            return this._renderRectangle(rectangle);
          })}
        </div>
        ${this.showGrid ? this._renderGrid() : nothing}
        ${
          this._mode.showCursor
            ? html`<div class="scene-layer" style=${styleMap(layerStyles)}>
                ${this._renderTileCursor()}
              </div>`
            : nothing
        }
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${this._scene.connectors.map((connector) => {
            return this._renderConnector(connector);
          })}
        </div>
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${this._scene.textBoxes.map((textBox) => {
            return this._renderTextBox(textBox);
          })}
        </div>
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${this._scene.connectors.map((connector) => {
            return this._renderConnectorLabel(connector);
          })}
        </div>
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${repeat(
            visibleItems,
            (item) => item.id,
            (item) => this._renderNode(item)
          )}
        </div>
        <div class="scene-layer controls" style=${styleMap(layerStyles)}>
          ${this._renderTransformControls()}
        </div>
      </div>
    `;
  }

  _renderGrid() {
    const theme = this._theme;
    const tileWidth = PROJECTED_TILE_SIZE.width * this._zoom;
    const tileHeight = PROJECTED_TILE_SIZE.height * this._zoom;
    const width = this.clientWidth;
    const height = this.clientHeight;

    return html`
      <div
        class="grid"
        style=${styleMap({
          '--grid-tile': `url("${gridTileDataUri(theme.gridStroke, theme.gridOpacity)}")`,
          backgroundSize: `${tileWidth}px ${tileHeight * 2}px`,
          backgroundPosition: `${width / 2 + this._scroll.x + tileWidth / 2}px ${
            height / 2 + this._scroll.y
          }px`
        })}
      ></div>
    `;
  }

  _renderTileCursor() {
    const theme = this._theme;
    const tile = this._mouse.position.tile;
    const { styles, pxSize } = this._projectionStyles(tile, tile);

    return html`
      <div class="projected" style=${styleMap(styles)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 ${pxSize.width} ${pxSize.height}"
          width="${pxSize.width}px"
          height="${pxSize.height}px"
        >
          <rect
            width=${pxSize.width}
            height=${pxSize.height}
            fill=${theme.controlsAccent}
            fill-opacity="0.5"
            rx=${10 * this._zoom}
          ></rect>
        </svg>
      </div>
    `;
  }

  _renderRectangle(rectangle) {
    const color = resolveColor(this._scene.colors, rectangle.color);
    const { styles, pxSize } = this._projectionStyles(rectangle.from, rectangle.to);

    return html`
      <div class="projected" style=${styleMap(styles)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 ${pxSize.width} ${pxSize.height}"
          width="${pxSize.width}px"
          height="${pxSize.height}px"
        >
          <rect
            width=${pxSize.width}
            height=${pxSize.height}
            fill=${color.value}
            rx="22"
            stroke=${getColorVariant(color.value, 'dark', { grade: 2 })}
            stroke-width="1"
          ></rect>
        </svg>
      </div>
    `;
  }

  _renderConnector(connector) {
    const theme = this._theme;
    const color = resolveColor(this._scene.colors, connector.color);
    const { styles, pxSize } = this._projectionStyles(
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

    return html`
      <div class="projected" style=${styleMap(styles)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 ${pxSize.width} ${pxSize.height}"
          width="${pxSize.width}px"
          height="${pxSize.height}px"
          style="transform: scale(-1, 1)"
        >
          <polyline
            points=${points}
            stroke=${theme.connectorHalo}
            stroke-width=${widthPx * 1.4}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity="0.7"
            stroke-dasharray=${dashArray}
            fill="none"
          ></polyline>
          <polyline
            points=${points}
            stroke=${getColorVariant(color.value, 'dark', { grade: 1 })}
            stroke-width=${widthPx}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray=${dashArray}
            fill="none"
          ></polyline>
          ${
            directionIcon
              ? svg`
              <g transform="translate(${directionIcon.x}, ${directionIcon.y})">
                <g transform="rotate(${directionIcon.rotation})">
                  <polygon
                    fill="black"
                    stroke=${theme.connectorHalo}
                    stroke-width="4"
                    points="17.58,17.01 0,-17.01 -17.58,17.01"
                  ></polygon>
                </g>
              </g>
            `
              : nothing
          }
        </svg>
      </div>
    `;
  }

  _renderConnectorLabel(connector) {
    if (!connector.description) return nothing;

    const tileIndex = Math.floor(connector.path.tiles.length / 2);
    const tile = connector.path.tiles[tileIndex];
    if (!tile) return nothing;

    const position = getTilePosition({
      tile: connectorPathTileToGlobal(tile, connector.path.rectangle.from)
    });

    return html`
      <div
        class="connector-label"
        style=${styleMap({
          left: toPx(position.x),
          top: toPx(position.y),
          maxWidth: toPx(PROJECTED_TILE_SIZE.width)
        })}
      >
        <div class="label-box">${connector.description}</div>
      </div>
    `;
  }

  _renderTextBox(textBox) {
    const to = {
      x: textBox.tile.x + textBox.size.width,
      y: textBox.tile.y
    };
    const { styles } = this._projectionStyles(textBox.tile, to, textBox.orientation);

    return html`
      <div class="projected" style=${styleMap(styles)}>
        <div
          class="textbox"
          style=${styleMap({
            paddingLeft: toPx(UNPROJECTED_TILE_SIZE * TEXTBOX_PADDING),
            paddingRight: toPx(UNPROJECTED_TILE_SIZE * TEXTBOX_PADDING),
            fontSize: toPx(UNPROJECTED_TILE_SIZE * textBox.fontSize),
            fontWeight: TEXTBOX_FONT_WEIGHT,
            fontFamily: DEFAULT_FONT_FAMILY,
            color: this._theme.textBoxText
          })}
        >
          ${textBox.content}
        </div>
      </div>
    `;
  }

  _renderNode(item) {
    const theme = this._theme;
    const modelItem = resolveModelItem(this._workingModel, item.id);
    if (!modelItem) return nothing;

    const icon = resolveIcon(this._workingModel, modelItem.icon);
    const position = getTilePosition({ tile: item.tile, origin: 'BOTTOM' });
    const labelHeight = item.labelHeight ?? DEFAULT_LABEL_HEIGHT;
    const labelAnchorY = PROJECTED_TILE_SIZE.height / 2;

    const description =
      modelItem.description && modelItem.description !== MARKDOWN_EMPTY_VALUE
        ? modelItem.description
        : null;
    const hasLabel = Boolean(modelItem.name || description);

    return html`
      <div class="node" style=${styleMap({ zIndex: String(-item.tile.x - item.tile.y) })}>
        <div
          class="node-anchor"
          style=${styleMap({ left: toPx(position.x), top: toPx(position.y) })}
        >
          ${
            hasLabel && labelHeight > 0
              ? svg`
              <svg
                class="label-line"
                width="3"
                height=${labelHeight}
                style="bottom: ${labelAnchorY}px; left: -1.5px; position: absolute;"
              >
                <line
                  x1="1.5" y1="0" x2="1.5" y2=${labelHeight}
                  stroke-dasharray="0, 6"
                  stroke=${theme.leaderLine}
                  stroke-width="3"
                  stroke-linecap="round"
                ></line>
              </svg>
            `
              : nothing
          }
          ${
            hasLabel
              ? html`
                  <div
                    class="label-box"
                    style=${styleMap({
                      bottom: toPx(labelAnchorY + labelHeight),
                      transform: 'translateX(-50%)'
                    })}
                  >
                    ${
                      modelItem.name
                        ? html`<div class="name">${modelItem.name}</div>`
                        : nothing
                    }
                    ${
                      description
                        ? html`<div class="description">${unsafeHTML(description)}</div>`
                        : nothing
                    }
                  </div>
                `
              : nothing
          }
          ${icon ? this._renderIcon(icon) : nothing}
        </div>
      </div>
    `;
  }

  _renderIcon(icon) {
    if (icon.isIsometric === false) {
      return html`
        <div
          class="node-icon-flat-wrapper"
          style=${styleMap({
            left: toPx(-PROJECTED_TILE_SIZE.width / 2),
            top: toPx(-PROJECTED_TILE_SIZE.height / 2),
            transform: getIsoProjectionCss()
          })}
        >
          <img
            src=${icon.url}
            alt=${`icon-${icon.id}`}
            style=${styleMap({ width: toPx(PROJECTED_TILE_SIZE.width * 0.7) })}
          />
        </div>
      `;
    }

    return html`
      <img
        class="node-icon"
        src=${icon.url}
        alt=${`icon-${icon.id}`}
        style=${styleMap({ width: toPx(PROJECTED_TILE_SIZE.width * 0.8) })}
      />
    `;
  }

  // --- transform controls (selection visuals) ---

  _renderTransformControls() {
    const theme = this._theme;
    if (!this._itemControls || this.editorMode !== 'EDITABLE') return nothing;

    const { type, id } = this._itemControls;

    try {
      if (type === 'CONNECTOR') {
        const connector = this._scene.connectors.find((c) => {
          return c.id === id;
        });
        if (!connector) return nothing;

        return connector.anchors.map((anchor) => {
          let tile;
          try {
            tile = getAnchorTile(anchor, this._scene.view);
          } catch {
            return nothing;
          }

          const position = getTilePosition({ tile });

          return html`
            <div
              class="projected connector-anchor"
              style=${styleMap({
                left: toPx(position.x - TRANSFORM_ANCHOR_SIZE / 2),
                top: toPx(position.y - TRANSFORM_ANCHOR_SIZE / 2),
                width: toPx(TRANSFORM_ANCHOR_SIZE),
                height: toPx(TRANSFORM_ANCHOR_SIZE),
                transform: getIsoProjectionCss()
              })}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 ${TRANSFORM_ANCHOR_SIZE} ${TRANSFORM_ANCHOR_SIZE}"
                width="${TRANSFORM_ANCHOR_SIZE}px"
                height="${TRANSFORM_ANCHOR_SIZE}px"
              >
                <circle
                  cx=${TRANSFORM_ANCHOR_SIZE / 2}
                  cy=${TRANSFORM_ANCHOR_SIZE / 2}
                  r=${TRANSFORM_ANCHOR_SIZE / 2 - 4}
                  fill=${theme.anchorFill}
                  stroke=${theme.anchorStroke}
                  stroke-width="4"
                ></circle>
              </svg>
            </div>
          `;
        });
      }

      if (type === 'ITEM') {
        const item = this._scene.items.find((i) => {
          return i.id === id;
        });
        if (!item) return nothing;

        return this._renderTransformBox(item.tile, item.tile);
      }

      if (type === 'RECTANGLE') {
        const rectangle = this._scene.rectangles.find((r) => {
          return r.id === id;
        });
        if (!rectangle) return nothing;

        return this._renderTransformBox(rectangle.from, rectangle.to, (anchor) => {
          this._mode = {
            type: 'RECTANGLE.TRANSFORM',
            showCursor: false,
            id,
            selectedAnchor: anchor
          };
        });
      }

      if (type === 'TEXTBOX') {
        const textBox = this._scene.textBoxes.find((t) => {
          return t.id === id;
        });
        if (!textBox) return nothing;

        const endTile = getTextBoxEndTile(textBox, textBox.size);

        return this._renderTransformBox(textBox.tile, {
          x: Math.ceil(endTile.x),
          y: Math.ceil(endTile.y)
        });
      }
    } catch {
      return nothing;
    }

    return nothing;
  }

  _renderTransformBox(from, to, onAnchorMouseDown = null) {
    const theme = this._theme;
    const strokeWidth = 2;
    const { styles, pxSize } = this._projectionStyles(from, to);

    const anchors = onAnchorMouseDown
      ? Object.entries(convertBoundsToNamedAnchors(getBoundingBox([from, to]))).map(
          ([name, tile], i) => {
            return {
              name,
              position: getTilePosition({
                tile,
                origin: outermostCornerPositions[i]
              })
            };
          }
        )
      : [];

    return html`
      <div class="projected" style=${styleMap({ ...styles, pointerEvents: 'none' })}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 ${pxSize.width} ${pxSize.height}"
          width="${pxSize.width}px"
          height="${pxSize.height}px"
        >
          <g transform="translate(${strokeWidth}, ${strokeWidth})">
            <rect
              width=${pxSize.width - strokeWidth * 2}
              height=${pxSize.height - strokeWidth * 2}
              fill="none"
              stroke=${theme.controlsAccent}
              stroke-dasharray="${strokeWidth * 2} ${strokeWidth * 2}"
              stroke-width=${strokeWidth}
              stroke-linecap="round"
            ></rect>
          </g>
        </svg>
      </div>
      ${anchors.map(({ name, position }) => {
        return html`
          <div
            class="transform-anchor"
            style=${styleMap({
              position: 'absolute',
              left: toPx(position.x - TRANSFORM_ANCHOR_SIZE / 2),
              top: toPx(position.y - TRANSFORM_ANCHOR_SIZE / 2),
              width: toPx(TRANSFORM_ANCHOR_SIZE),
              height: toPx(TRANSFORM_ANCHOR_SIZE),
              transform: getIsoProjectionCss(),
              transformOrigin: 'top left'
            })}
            @mousedown=${() => {
              return onAnchorMouseDown(name);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 ${TRANSFORM_ANCHOR_SIZE} ${TRANSFORM_ANCHOR_SIZE}"
              width="${TRANSFORM_ANCHOR_SIZE}px"
              height="${TRANSFORM_ANCHOR_SIZE}px"
            >
              <circle
                cx=${TRANSFORM_ANCHOR_SIZE / 2}
                cy=${TRANSFORM_ANCHOR_SIZE / 2}
                r=${TRANSFORM_ANCHOR_SIZE / 2 - 2}
                fill=${theme.anchorFill}
                stroke=${theme.controlsAccent}
                stroke-width="2"
              ></circle>
            </svg>
          </div>
        `;
      })}
    `;
  }
}

customElements.define('lit-isoflow', LitIsoflow);
