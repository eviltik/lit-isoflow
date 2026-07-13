/** @typedef {{ x: number, y: number }} Coords */

export const CoordsUtils = {
  /** @param {Coords} base @param {Coords} operand */
  isEqual(base, operand) {
    return base.x === operand.x && base.y === operand.y;
  },

  /** @param {Coords} base @param {Coords} operand @returns {Coords} */
  subtract(base, operand) {
    return { x: base.x - operand.x, y: base.y - operand.y };
  },

  /** @param {Coords} base @param {Coords} operand @returns {Coords} */
  add(base, operand) {
    return { x: base.x + operand.x, y: base.y + operand.y };
  },

  /** @param {Coords} base @param {number} operand @returns {Coords} */
  multiply(base, operand) {
    return { x: base.x * operand, y: base.y * operand };
  },

  /** @returns {Coords} */
  zero() {
    return { x: 0, y: 0 };
  }
};
