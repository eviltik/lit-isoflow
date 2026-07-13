/** @typedef {{ width: number, height: number }} Size */

export const SizeUtils = {
  /** @param {Size} base @param {Size} operand */
  isEqual(base, operand) {
    return base.width === operand.width && base.height === operand.height;
  },

  /** @param {Size} base @param {number} operand @returns {Size} */
  multiply(base, operand) {
    return { width: base.width * operand, height: base.height * operand };
  }
};
