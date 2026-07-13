export const generateId = () => {
  return crypto.randomUUID();
};

export const clamp = (num, min, max) => {
  return Math.max(Math.min(num, max), min);
};

export const roundToOneDecimalPlace = (num) => {
  return Math.round(num * 10) / 10;
};

export const toPx = (value) => {
  return `${value}px`;
};

/**
 * Lightweight replacement for Isoflow's chroma-js based getColorVariant.
 * Adjusts lightness (and saturation for the dark variant) in HSL space,
 * which is close enough to chroma's Lab brighten/darken for UI accents.
 *
 * @param {string} color - CSS hex color (#rgb or #rrggbb)
 * @param {'light'|'dark'} variant
 * @param {{ alpha?: number, grade?: number }} [opts]
 * @returns {string} CSS color string
 */
export const getColorVariant = (color, variant, { alpha = 1, grade = 1 } = {}) => {
  const { h, s, l } = hexToHsl(color);
  let newL = l;
  let newS = s;

  if (variant === 'light') {
    newL = clamp(l + 0.18 * grade, 0, 1);
  } else if (variant === 'dark') {
    newL = clamp(l - 0.18 * grade, 0, 1);
    newS = clamp(s + 0.1 * grade, 0, 1);
  }

  const { r, g, b } = hslToRgb(h, newS, newL);

  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hexToHsl = (hex) => {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => {
        return c + c;
      })
      .join('');
  }

  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }

  return { h, s, l };
};

const hslToRgb = (h, s, l) => {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hueToRgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
  };
};

/**
 * @template {{ id: string }} T
 * @param {T[]} values
 * @param {string} id
 * @returns {{ value: T, index: number }}
 */
export function getItemByIdOrThrow(values, id) {
  const index = values.findIndex((val) => {
    return val.id === id;
  });

  if (index === -1) {
    throw new Error(`Item with id "${id}" not found.`);
  }

  return { value: values[index], index };
}

/**
 * @template {{ id: string }} T
 * @param {T[]} values
 * @param {string} id
 * @returns {T | null}
 */
export function getItemById(values, id) {
  const item = values.find((val) => {
    return val.id === id;
  });

  return item ?? null;
}
