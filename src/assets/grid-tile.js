/**
 * Grid tile background, verbatim from Isoflow's src/assets/grid-tile-bg.svg.
 *
 * Exposed two ways: as a data URI (the component uses it as a CSS
 * background-image) and as raw geometry (the SVG renderer inlines it into a
 * <pattern>, since not every SVG consumer decodes nested data URIs).
 */
export const GRID_TILE_VIEWBOX = '0 0 141.38828 163.26061';

export const GRID_TILE_BODY = `<g stroke="#000000" stroke-opacity="0.15" stroke-width="1">
    <polygon points="70.69436 122.44546 .00022 81.63018 70.69392 40.81515 141.38806 81.63043 70.69436 122.44546" fill="none"/>
    <line x1="70.69414" y1="40.81503" x2="141.38784" />
    <line y1="0" x2="70.69414" y2="40.81528" />
    <line x1="70.69414" y1="122.44559" x2=".00044" y2="163.26061" />
    <line x1="141.38828" y1="163.26061" x2="70.69414" y2="122.44533" />
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GRID_TILE_VIEWBOX}">
  ${GRID_TILE_BODY}
</svg>`;

export const gridTileDataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
