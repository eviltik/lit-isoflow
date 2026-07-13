/**
 * Self-contained demo icons: simple isometric cubes as SVG data URIs.
 * Real projects would typically use Isoflow-compatible isopack icons.
 */
const isoCube = ({ top, left, right }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 115">
  <polygon points="50,0 100,29 50,58 0,29" fill="${top}"/>
  <polygon points="0,29 50,58 50,115 0,86" fill="${left}"/>
  <polygon points="50,58 100,29 100,86 50,115" fill="${right}"/>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const demoIcons = [
  {
    id: 'server',
    name: 'Server',
    isIsometric: true,
    url: isoCube({ top: '#8faef3', left: '#5375c9', right: '#3d5aa8' })
  },
  {
    id: 'database',
    name: 'Database',
    isIsometric: true,
    url: isoCube({ top: '#93dbb1', left: '#4fa876', right: '#3b8a5e' })
  },
  {
    id: 'gateway',
    name: 'Gateway',
    isIsometric: true,
    url: isoCube({ top: '#f3c98f', left: '#c99653', right: '#a8783d' })
  },
  {
    id: 'client',
    name: 'Client',
    isIsometric: true,
    url: isoCube({ top: '#e39ddd', left: '#b45cab', right: '#94408c' })
  }
];
