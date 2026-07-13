/**
 * Palettes claire et sombre du diagramme.
 *
 * Le rendu vit dans deux mondes : le composant (CSS + SVG dans le shadow DOM)
 * et le renderer pur JS (chaînes SVG, sans CSS). Les deux doivent produire les
 * mêmes couleurs — d'où ce catalogue unique, consommé comme des valeurs et non
 * comme des variables CSS.
 *
 * Les couleurs des ÉLÉMENTS (nœuds, connecteurs, zones) viennent du modèle
 * (`model.colors`) et ne changent pas avec le thème : elles appartiennent au
 * diagramme, pas à l'interface. Seul le décor s'adapte — fond, grille,
 * étiquettes, contours.
 */

/** @typedef {typeof LIGHT_THEME} Theme */

export const LIGHT_THEME = {
  /** Fond du canvas. */
  background: '#f6faff',
  /** Traits de la grille isométrique. */
  gridStroke: '#000000',
  gridOpacity: 0.15,

  /** Cartouche des étiquettes (nœuds, connecteurs). */
  labelBackground: '#ffffff',
  labelBorder: '#bdbdbd',
  labelText: '#1c2430',
  /** Texte secondaire : description d'un nœud, libellé d'un connecteur. */
  labelMutedText: '#666666',
  /** Ligne de rappel entre l'icône et son étiquette. */
  leaderLine: '#000000',

  /** Texte d'une zone de texte libre. */
  textBoxText: '#1c2430',

  /** Liseré blanc sous les connecteurs, qui les détache du fond. */
  connectorHalo: '#ffffff',
  /** Flèche de direction d'un connecteur. */
  connectorArrow: '#000000',
  connectorArrowStroke: '#ffffff',

  /** Poignées de transformation et curseur de tuile. */
  controlsAccent: '#0392ff',
  anchorFill: '#ffffff',
  anchorStroke: '#000000',

  /** Message d'erreur de modèle. */
  errorText: '#b3261e'
};

export const DARK_THEME = {
  ...LIGHT_THEME,

  background: '#1c2128',
  gridStroke: '#ffffff',
  gridOpacity: 0.08,

  labelBackground: '#2d333b',
  labelBorder: '#444c56',
  labelText: '#e6edf3',
  labelMutedText: '#9198a1',
  leaderLine: '#8b949e',

  textBoxText: '#e6edf3',

  // Le halo doit toujours contraster avec le FOND, pas avec le trait : en
  // sombre, c'est donc un halo sombre.
  connectorHalo: '#1c2128',
  connectorArrow: '#e6edf3',
  connectorArrowStroke: '#1c2128',

  controlsAccent: '#4493f8',
  anchorFill: '#2d333b',
  anchorStroke: '#e6edf3',

  errorText: '#ff7b72'
};

/**
 * Résout un nom de thème en palette.
 *
 * @param {'auto'|'light'|'dark'} [theme='auto'] — `auto` suit la préférence du
 *   système (`prefers-color-scheme`), et retombe sur le thème clair hors
 *   navigateur (Node, rendu SVG en ligne de commande).
 * @returns {Theme}
 */
export const resolveTheme = (theme = 'auto') => {
  if (theme === 'dark') return DARK_THEME;
  if (theme === 'light') return LIGHT_THEME;

  const prefersDark =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches;

  return prefersDark ? DARK_THEME : LIGHT_THEME;
};
