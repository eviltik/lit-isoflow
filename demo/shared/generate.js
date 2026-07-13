/**
 * Synthetic model generator, for the stress demo.
 *
 * The point is to answer a blunt question — how many nodes can a diagram hold
 * before the component stops being usable? — so the generator has to produce
 * something *representative*, not something flattering: nodes carry labels and
 * descriptions (each label is a DOM subtree), and connectors are routed by A*
 * exactly as a hand-drawn one would be.
 */

import { demoIcons } from './model.js';

// A handful of recognisable icons, cycled through: which icons are used has no
// bearing on cost (they are all data-URI SVGs, drawn once as a <symbol>).
const ICONS = ['server', 'storage', 'laptop', 'router', 'firewall', 'cloud'].filter(
  (id) => {
    return demoIcons.some((icon) => icon.id === id);
  }
);

const COLORS = [
  { id: 'blue', value: '#a5b8f3' },
  { id: 'green', value: '#a8e3c0' },
  { id: 'yellow', value: '#f3e3a5' },
  { id: 'red', value: '#e3a5a5' },
  { id: 'purple', value: '#d3a5e3' }
];

/**
 * Lays `count` nodes out on a square-ish grid, two tiles apart so labels do not
 * overlap into an unreadable mush.
 *
 * @param {object} options
 * @param {number} options.count — how many nodes
 * @param {number} [options.connectorRatio=0.5] — connectors per node (each one
 *   links a node to its right-hand neighbour); 0 disables routing entirely,
 *   which is worth measuring separately since A* is the expensive part.
 * @param {boolean} [options.labels=true] — give nodes a name and a description
 * @returns {object} a model, valid against the schema
 */
export const generateModel = ({ count, connectorRatio = 0.5, labels = true }) => {
  const side = Math.ceil(Math.sqrt(count));
  const items = [];
  const viewItems = [];

  for (let i = 0; i < count; i += 1) {
    const id = `n${i}`;
    const icon = ICONS[i % ICONS.length];

    items.push({
      id,
      name: labels ? `Node ${i}` : '',
      icon,
      ...(labels ? { description: `<p>Synthetic node #${i}</p>` } : {})
    });

    viewItems.push({
      id,
      tile: { x: (i % side) * 2, y: Math.floor(i / side) * 2 },
      labelHeight: 80
    });
  }

  const connectors = [];
  const wanted = Math.round(count * connectorRatio);

  for (let i = 0; i < wanted && i + 1 < count; i += 1) {
    connectors.push({
      id: `c${i}`,
      color: COLORS[i % COLORS.length].id,
      anchors: [
        { id: `c${i}a`, ref: { item: `n${i}` } },
        { id: `c${i}b`, ref: { item: `n${i + 1}` } }
      ]
    });
  }

  return {
    version: '1.0.0',
    title: `Stress test — ${count} nodes`,
    icons: demoIcons,
    colors: COLORS,
    items,
    views: [
      {
        id: 'main',
        name: 'Stress',
        items: viewItems,
        connectors,
        rectangles: [],
        textBoxes: []
      }
    ]
  };
};
