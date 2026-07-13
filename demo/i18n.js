/**
 * Minimal i18n for the demo — no dependency, no build step.
 *
 * The component itself only owns two strings (see DEFAULT_STRINGS in
 * src/config.js); everything below belongs to this host app, which is exactly
 * how a real integration works.
 *
 * Add a language: drop a dictionary in MESSAGES, keyed by its language code.
 * Missing keys fall back to English.
 */
const MESSAGES = {
  en: {
    'lang.name': 'English',

    'tool.cursor': 'Select / move (V)',
    'tool.pan': 'Pan the view (hold Shift/Space)',
    'tool.place': 'Place an icon',
    'tool.connector': 'Draw a connector',
    'tool.rectangle': 'Draw a zone',
    'tool.textbox': 'Add text',
    'action.undo': 'Undo (Ctrl+Z)',
    'action.redo': 'Redo (Ctrl+Y)',
    'action.delete': 'Delete (Del)',

    'mode.editor': 'Editor',
    'mode.viewer': 'Viewer',

    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'zoom.fit': 'Fit to view',
    'export.png': 'Export as PNG',
    'export.svg': 'Export as SVG (vector)',
    'export.json': 'Export JSON',

    'gallery.search': 'Search an icon…',
    'gallery.more': ({ count }) => `${count} more icons — refine your search`,
    'gallery.empty': 'No icon matches',
    'gallery.choose': 'Choose…',

    'hints.pan': 'pan',
    'hints.delete': 'delete',
    'hints.undo': 'undo / redo',

    'panel.type.ITEM': 'Node',
    'panel.type.CONNECTOR': 'Connector',
    'panel.type.RECTANGLE': 'Zone',
    'panel.type.TEXTBOX': 'Text',
    'panel.name': 'Name',
    'panel.description': 'Description (HTML)',
    'panel.icon': 'Icon',
    'panel.label': 'Label',
    'panel.color': 'Color',
    'panel.style': 'Style',
    'panel.text': 'Text',
    'panel.size': 'Size',
    'panel.delete': 'Delete',

    'style.solid': 'Solid',
    'style.dashed': 'Dashed',
    'style.dotted': 'Dotted',
    'size.small': 'Small',
    'size.normal': 'Normal',
    'size.large': 'Large',

    // The sample diagram's own labels.
    'demo.title': 'lit-isoflow demo',
    'demo.viewName': 'Architecture',
    'demo.client': 'Client machine',
    'demo.clientDescription': 'Web browser',
    'demo.gateway': 'Gateway',
    'demo.web1': 'Web server 1',
    'demo.web2': 'Web server 2',
    'demo.database': 'Database',
    'demo.zoneLabel': 'Production infrastructure',

    // Strings the component itself renders (passed via its `strings` property).
    'component.untitledItem': 'Untitled',
    'component.invalidModel': 'Invalid diagram model'
  },

  fr: {
    'lang.name': 'Français',

    'tool.cursor': 'Sélectionner / déplacer (V)',
    'tool.pan': 'Déplacer la vue (ou maintenir Maj/Espace)',
    'tool.place': 'Placer une icône',
    'tool.connector': 'Tracer un connecteur',
    'tool.rectangle': 'Dessiner une zone',
    'tool.textbox': 'Ajouter du texte',
    'action.undo': 'Annuler (Ctrl+Z)',
    'action.redo': 'Rétablir (Ctrl+Y)',
    'action.delete': 'Supprimer (Suppr)',

    'mode.editor': 'Éditeur',
    'mode.viewer': 'Visionneuse',

    'zoom.in': 'Zoom avant',
    'zoom.out': 'Zoom arrière',
    'zoom.fit': 'Ajuster à la vue',
    'export.png': 'Exporter en PNG',
    'export.svg': 'Exporter en SVG (vectoriel)',
    'export.json': 'Exporter le JSON',

    'gallery.search': 'Rechercher une icône…',
    'gallery.more': ({ count }) => `${count} autres icônes — affinez la recherche`,
    'gallery.empty': 'Aucune icône ne correspond',
    'gallery.choose': 'Choisir…',

    'hints.pan': 'déplacer',
    'hints.delete': 'supprimer',
    'hints.undo': 'annuler / rétablir',

    'panel.type.ITEM': 'Nœud',
    'panel.type.CONNECTOR': 'Connecteur',
    'panel.type.RECTANGLE': 'Zone',
    'panel.type.TEXTBOX': 'Texte',
    'panel.name': 'Nom',
    'panel.description': 'Description (HTML)',
    'panel.icon': 'Icône',
    'panel.label': 'Libellé',
    'panel.color': 'Couleur',
    'panel.style': 'Style',
    'panel.text': 'Texte',
    'panel.size': 'Taille',
    'panel.delete': 'Supprimer',

    'style.solid': 'Plein',
    'style.dashed': 'Tirets',
    'style.dotted': 'Pointillés',
    'size.small': 'Petit',
    'size.normal': 'Normal',
    'size.large': 'Grand',

    'demo.title': 'Démo lit-isoflow',
    'demo.viewName': 'Architecture',
    'demo.client': 'Poste client',
    'demo.clientDescription': 'Navigateur web',
    'demo.gateway': 'Passerelle',
    'demo.web1': 'Serveur web 1',
    'demo.web2': 'Serveur web 2',
    'demo.database': 'Base de données',
    'demo.zoneLabel': 'Infrastructure de production',

    'component.untitledItem': 'Sans titre',
    'component.invalidModel': 'Modèle de diagramme invalide'
  }
};

export const LANGUAGES = Object.keys(MESSAGES);

const STORAGE_KEY = 'lit-isoflow-demo-lang';

/** Stored choice, else the browser language, else English. */
export const detectLanguage = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && MESSAGES[stored]) return stored;

  const browser = (navigator.language || 'en').slice(0, 2);
  return MESSAGES[browser] ? browser : 'en';
};

export const setLanguage = (lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
};

/**
 * @param {string} lang
 * @returns {(key: string, params?: object) => string} translator, English fallback
 */
export const createTranslator = (lang) => {
  return (key, params) => {
    const value = MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key;
    return typeof value === 'function' ? value(params ?? {}) : value;
  };
};

/** The subset of strings the component renders itself. */
export const componentStrings = (t) => {
  return {
    untitledItem: t('component.untitledItem'),
    invalidModel: t('component.invalidModel')
  };
};

export const languageName = (lang) => {
  return MESSAGES[lang]['lang.name'];
};
