/**
 * Model mutations, ported from Isoflow's stores/reducers/*.
 *
 * Unlike Isoflow (immer + zustand, incremental scene sync), these mutate the
 * component's working model in place; <lit-isoflow> re-derives the scene and
 * emits a snapshot after each change. Ordering semantics are preserved:
 * new items are unshifted (rendered behind existing ones on the same layer).
 */
import { VIEW_ITEM_DEFAULTS, CONNECTOR_DEFAULTS } from '../config.js';
import { getItemByIdOrThrow } from '../utils/common.js';
import { getConnectorsByViewItem } from '../utils/renderer.js';

const getView = (model, viewId) => {
  return getItemByIdOrThrow(model.views, viewId).value;
};

const touch = (model, viewId) => {
  getView(model, viewId).lastUpdated = new Date().toISOString();
};

// --- view items (nodes) ---

export const createViewItem = (model, viewId, newViewItem) => {
  const view = getView(model, viewId);

  view.items.unshift({ ...VIEW_ITEM_DEFAULTS, ...newViewItem });
  touch(model, viewId);
};

export const updateViewItem = (model, viewId, id, updates) => {
  const view = getView(model, viewId);
  const item = getItemByIdOrThrow(view.items, id);

  view.items[item.index] = { ...item.value, ...updates };
  touch(model, viewId);
};

export const deleteViewItem = (model, viewId, id) => {
  const view = getView(model, viewId);
  const item = getItemByIdOrThrow(view.items, id);

  view.items.splice(item.index, 1);

  // Drop connectors left with a dangling reference to the deleted item.
  const orphaned = getConnectorsByViewItem(id, view.connectors ?? []);
  view.connectors = (view.connectors ?? []).filter((connector) => {
    return !orphaned.includes(connector);
  });
  touch(model, viewId);
};

// --- model items (name, description, icon) ---

export const createModelItem = (model, newModelItem) => {
  model.items.push(newModelItem);
};

export const updateModelItem = (model, id, updates) => {
  const item = getItemByIdOrThrow(model.items, id);

  model.items[item.index] = { ...item.value, ...updates };
};

export const deleteModelItem = (model, id) => {
  const item = getItemByIdOrThrow(model.items, id);

  model.items.splice(item.index, 1);
};

// --- connectors ---

export const createConnector = (model, viewId, newConnector) => {
  const view = getView(model, viewId);

  if (!view.connectors) view.connectors = [];
  view.connectors.unshift({ ...CONNECTOR_DEFAULTS, ...newConnector });
  touch(model, viewId);
};

export const updateConnector = (model, viewId, id, updates) => {
  const view = getView(model, viewId);
  const connector = getItemByIdOrThrow(view.connectors ?? [], id);

  view.connectors[connector.index] = { ...connector.value, ...updates };
  touch(model, viewId);
};

export const deleteConnector = (model, viewId, id) => {
  const view = getView(model, viewId);
  const connector = getItemByIdOrThrow(view.connectors ?? [], id);

  view.connectors.splice(connector.index, 1);
  touch(model, viewId);
};

// --- rectangles ---

export const createRectangle = (model, viewId, newRectangle) => {
  const view = getView(model, viewId);

  if (!view.rectangles) view.rectangles = [];
  view.rectangles.unshift(newRectangle);
  touch(model, viewId);
};

export const updateRectangle = (model, viewId, id, updates) => {
  const view = getView(model, viewId);
  const rectangle = getItemByIdOrThrow(view.rectangles ?? [], id);

  view.rectangles[rectangle.index] = { ...rectangle.value, ...updates };
  touch(model, viewId);
};

export const deleteRectangle = (model, viewId, id) => {
  const view = getView(model, viewId);
  const rectangle = getItemByIdOrThrow(view.rectangles ?? [], id);

  view.rectangles.splice(rectangle.index, 1);
  touch(model, viewId);
};

// --- text boxes ---

export const createTextBox = (model, viewId, newTextBox) => {
  const view = getView(model, viewId);

  if (!view.textBoxes) view.textBoxes = [];
  view.textBoxes.unshift(newTextBox);
  touch(model, viewId);
};

export const updateTextBox = (model, viewId, id, updates) => {
  const view = getView(model, viewId);
  const textBox = getItemByIdOrThrow(view.textBoxes ?? [], id);

  view.textBoxes[textBox.index] = { ...textBox.value, ...updates };
  touch(model, viewId);
};

export const deleteTextBox = (model, viewId, id) => {
  const view = getView(model, viewId);
  const textBox = getItemByIdOrThrow(view.textBoxes ?? [], id);

  view.textBoxes.splice(textBox.index, 1);
  touch(model, viewId);
};

// --- layer ordering (rectangles only, like Isoflow) ---

export const changeLayerOrder = (model, viewId, { action, item }) => {
  const view = getView(model, viewId);
  let arr;

  switch (item.type) {
    case 'RECTANGLE':
      arr = view.rectangles ?? [];
      break;
    default:
      throw new Error('Invalid item type');
  }

  const target = getItemByIdOrThrow(arr, item.id);

  if (action === 'SEND_BACKWARD' && target.index < arr.length - 1) {
    arr.splice(target.index, 1);
    arr.splice(target.index + 1, 0, target.value);
  } else if (action === 'SEND_TO_BACK' && target.index !== arr.length - 1) {
    arr.splice(target.index, 1);
    arr.push(target.value);
  } else if (action === 'BRING_FORWARD' && target.index > 0) {
    arr.splice(target.index, 1);
    arr.splice(target.index - 1, 0, target.value);
  } else if (action === 'BRING_TO_FRONT' && target.index !== 0) {
    arr.splice(target.index, 1);
    arr.unshift(target.value);
  }
  touch(model, viewId);
};
