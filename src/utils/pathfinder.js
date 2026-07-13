import PF from 'pathfinding';

/**
 * A* path between two tiles inside a bounded grid, diagonals allowed.
 * Ported from Isoflow's src/utils/pathfinder.ts.
 *
 * @param {{ gridSize: import('./size.js').Size, from: import('./coords.js').Coords, to: import('./coords.js').Coords }} args
 * @returns {import('./coords.js').Coords[]}
 */
export const findPath = ({ gridSize, from, to }) => {
  const grid = new PF.Grid(gridSize.width, gridSize.height);
  const finder = new PF.AStarFinder({
    heuristic: PF.Heuristic.manhattan,
    diagonalMovement: PF.DiagonalMovement.Always
  });
  const path = finder.findPath(from.x, from.y, to.x, to.y, grid);

  return path.map((tile) => {
    return { x: tile[0], y: tile[1] };
  });
};
