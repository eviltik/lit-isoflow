/**
 * <lit-isoflow> — isometric diagram renderer.
 *
 * Phase 1: read-only rendering (grid, nodes, connectors, rectangles,
 * text boxes, labels) with pan & zoom. Model format is interchangeable
 * with Isoflow/FossFLOW JSON exports.
 *
 * Layer order mirrors Isoflow's Renderer: rectangles < grid < connectors
 * < textBoxes < connectorLabels < nodes.
 */
import { LitElement, html, svg, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { styleMap } from 'lit/directives/style-map.js';
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
  getIsoProjectionCss,
  getConnectorDirectionIcon,
  connectorPathTileToGlobal,
  incrementZoom,
  decrementZoom,
  getFitToViewParams
} from './utils/renderer.js';
import { getColorVariant, toPx } from './utils/common.js';
import { gridTileDataUri } from './assets/grid-tile.js';

export class LitIsoflow extends LitElement {
  static properties = {
    /** Diagram model (Isoflow/FossFLOW JSON). */
    model: { type: Object },
    /** View to display; defaults to the model's first view. */
    viewId: { type: String, attribute: 'view-id' },
    /** 'EXPLORABLE_READONLY' (pan/zoom) or 'NON_INTERACTIVE'. */
    editorMode: { type: String, attribute: 'editor-mode' },
    showGrid: { type: Boolean, attribute: 'show-grid' },
    backgroundColor: { type: String, attribute: 'background-color' },
    /** Fit the whole view in the viewport once on load. */
    fitToView: { type: Boolean, attribute: 'fit-to-view' },

    _zoom: { state: true },
    _scroll: { state: true },
    _animated: { state: true },
    _modelError: { state: true }
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      font-family: ${css`Roboto, Arial, sans-serif`};
      contain: strict;
    }

    .container {
      position: absolute;
      inset: 0;
      overflow: hidden;
      transform: translateZ(0);
      user-select: none;
    }

    .container.pannable {
      cursor: grab;
    }

    .container.pannable.panning {
      cursor: grabbing;
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
    }

    .animated .scene-layer {
      transition: transform 0.25s ease-out;
    }

    .animated .grid {
      transition:
        background-size 0.25s ease-out,
        background-position 0.25s ease-out;
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
      background: #ffffff;
      border: 1px solid #bdbdbd;
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
      color: #555555;
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
      color: #666666;
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
      color: #b3261e;
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

    this._zoom = 1;
    this._scroll = { x: 0, y: 0 };
    this._animated = true;
    this._modelError = null;
    this._scene = null;
    this._parsedModel = null;
    this._panPointerId = null;
    this._lastPanPosition = null;
    this._hasFitted = false;

    this._resizeObserver = new ResizeObserver(() => {
      this._rendererSize = {
        width: this.clientWidth,
        height: this.clientHeight
      };
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
  }

  willUpdate(changed) {
    if (changed.has('model') || changed.has('viewId')) {
      this._ingestModel();
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
    if (!this._scene) return;

    const size = {
      width: this.clientWidth || 1,
      height: this.clientHeight || 1
    };
    const { zoom, scroll } = getFitToViewParams(this._scene.view, size);

    this._animated = true;
    this._zoom = zoom;
    this._scroll = scroll;
    this._emitZoom();
  }

  _ingestModel() {
    this._modelError = null;
    this._scene = null;
    this._parsedModel = null;

    if (!this.model) return;

    const candidate = { ...INITIAL_DATA, ...this.model };
    const result = modelSchema.safeParse(candidate);

    if (!result.success) {
      this._modelError = result.error.issues
        .map((issue) => {
          return `${issue.path.join('.')}: ${issue.message}`;
        })
        .join(' — ');
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
      this._parsedModel = result.data;
      this._scene = deriveScene(result.data, this.viewId || undefined);
    } catch (error) {
      this._modelError = error.message;
    }
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

  get _interactive() {
    return this.editorMode !== 'NON_INTERACTIVE';
  }

  _onWheel(event) {
    if (!this._interactive) return;

    event.preventDefault();
    this._setZoom(event.deltaY > 0 ? decrementZoom(this._zoom) : incrementZoom(this._zoom));
  }

  _onPointerDown(event) {
    if (!this._interactive || event.button !== 0) return;

    this._panPointerId = event.pointerId;
    this._lastPanPosition = { x: event.clientX, y: event.clientY };
    this._animated = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  _onPointerMove(event) {
    if (event.pointerId !== this._panPointerId || !this._lastPanPosition) return;

    const delta = {
      x: event.clientX - this._lastPanPosition.x,
      y: event.clientY - this._lastPanPosition.y
    };
    this._lastPanPosition = { x: event.clientX, y: event.clientY };
    this._scroll = {
      x: this._scroll.x + delta.x,
      y: this._scroll.y + delta.y
    };
  }

  _onPointerUp(event) {
    if (event.pointerId !== this._panPointerId) return;

    this._panPointerId = null;
    this._lastPanPosition = null;
  }

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

  render() {
    if (this._modelError) {
      return html`<div class="error">${this._modelError}</div>`;
    }

    if (!this._scene) return nothing;

    const layerTransform = `translate(${this._scroll.x}px, ${this._scroll.y}px) scale(${this._zoom})`;
    const layerStyles = { transform: layerTransform };

    return html`
      <div
        class="container ${this._animated ? 'animated' : ''} ${this._interactive
          ? 'pannable'
          : ''} ${this._panPointerId !== null ? 'panning' : ''}"
        style=${styleMap({
          backgroundColor: this.backgroundColor || DIAGRAM_BACKGROUND_COLOR
        })}
        @wheel=${this._onWheel}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
      >
        <div class="scene-layer" style=${styleMap(layerStyles)}>
          ${this._scene.rectangles.map((rectangle) => {
            return this._renderRectangle(rectangle);
          })}
        </div>
        ${this.showGrid ? this._renderGrid() : nothing}
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
          ${[...this._scene.items].reverse().map((item) => {
            return this._renderNode(item);
          })}
        </div>
      </div>
    `;
  }

  _renderGrid() {
    const tileWidth = PROJECTED_TILE_SIZE.width * this._zoom;
    const tileHeight = PROJECTED_TILE_SIZE.height * this._zoom;
    const width = this.clientWidth;
    const height = this.clientHeight;

    return html`
      <div
        class="grid"
        style=${styleMap({
          '--grid-tile': `url("${gridTileDataUri}")`,
          backgroundSize: `${tileWidth}px ${tileHeight * 2}px`,
          backgroundPosition: `${width / 2 + this._scroll.x + tileWidth / 2}px ${
            height / 2 + this._scroll.y
          }px`
        })}
      ></div>
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
            stroke="#ffffff"
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
          ${directionIcon
            ? svg`
              <g transform="translate(${directionIcon.x}, ${directionIcon.y})">
                <g transform="rotate(${directionIcon.rotation})">
                  <polygon
                    fill="black"
                    stroke="#ffffff"
                    stroke-width="4"
                    points="17.58,17.01 0,-17.01 -17.58,17.01"
                  ></polygon>
                </g>
              </g>
            `
            : nothing}
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
            fontFamily: DEFAULT_FONT_FAMILY
          })}
        >
          ${textBox.content}
        </div>
      </div>
    `;
  }

  _renderNode(item) {
    const modelItem = resolveModelItem(this._parsedModel, item.id);
    if (!modelItem) return nothing;

    const icon = resolveIcon(this._parsedModel, modelItem.icon);
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
          ${hasLabel && labelHeight > 0
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
                  stroke="black"
                  stroke-width="3"
                  stroke-linecap="round"
                ></line>
              </svg>
            `
            : nothing}
          ${hasLabel
            ? html`
                <div
                  class="label-box"
                  style=${styleMap({
                    bottom: toPx(labelAnchorY + labelHeight),
                    transform: 'translateX(-50%)'
                  })}
                >
                  ${modelItem.name
                    ? html`<div class="name">${modelItem.name}</div>`
                    : nothing}
                  ${description
                    ? html`<div class="description">${unsafeHTML(description)}</div>`
                    : nothing}
                </div>
              `
            : nothing}
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
}

customElements.define('lit-isoflow', LitIsoflow);
