// Hex grid math — pointy-top, axial coordinates (q, r).
// Side indices 0..5 ordered: 0=NE, 1=E, 2=SE, 3=SW, 4=W, 5=NW.

export const NEIGHBORS = [
  [1, -1], // 0 NE
  [1, 0],  // 1 E
  [0, 1],  // 2 SE
  [-1, 1], // 3 SW
  [-1, 0], // 4 W
  [0, -1], // 5 NW
];

export const OPPOSITE_SIDE = [3, 4, 5, 0, 1, 2];

export function key(q, r) {
  return `${q},${r}`;
}

export function axialToPixel(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

// Vertex i of a pointy-top hex (i=0 is the top, going clockwise).
export function hexVertex(cx, cy, size, i) {
  const angle = ((-90 + i * 60) * Math.PI) / 180;
  return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
}

export function hexCorners(cx, cy, size) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push(hexVertex(cx, cy, size, i));
  return v;
}

// Midpoint of side `i` (as defined above) relative to a hex centered at (cx, cy).
// Side i lies between vertex i and vertex (i+1)%6 of the pointy-top hex,
// but our side numbering starts at NE so we offset.
// Geometric angle for side i midpoint, screen coords (+y down):
//   side 0 (NE) -> -60°,  side 1 (E) -> 0°,  side 2 (SE) -> 60°,
//   side 3 (SW) -> 120°,  side 4 (W) -> 180°, side 5 (NW) -> 240°.
export function sideMidpoint(cx, cy, size, sideIdx) {
  const apothem = (size * Math.sqrt(3)) / 2;
  const angle = ((sideIdx - 1) * 60 * Math.PI) / 180;
  return { x: cx + apothem * Math.cos(angle), y: cy + apothem * Math.sin(angle) };
}

// Hex symmetry group D6 acting on axial coords (12 elements).
// Rotation 60° CW: (q, r) -> (-r, q + r).
// Reflection (one of six): (q, r) -> (q + r, -r). Combined with rotations
// this generates all 12 dihedral symmetries.
export function rot60(q, r) {
  return [-r, q + r];
}

export function reflect(q, r) {
  return [q + r, -r];
}

export function applySymmetry(cells, rot, mirror) {
  return cells.map(([q, r]) => {
    let a = q, b = r;
    if (mirror) [a, b] = reflect(a, b);
    for (let i = 0; i < rot; i++) [a, b] = rot60(a, b);
    return [a, b];
  });
}

// Translate cells so the lex-smallest cell is at (0, 0), then sort lex.
export function normalize(cells) {
  const sorted = cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [minQ, minR] = sorted[0];
  return sorted.map(([q, r]) => [q - minQ, r - minR]);
}

// Bounding pixel box for a set of cells, given hex size.
export function bbox(cells, size) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [q, r] of cells) {
    const { x, y } = axialToPixel(q, r, size);
    // expand by hex circumradius
    minX = Math.min(minX, x - size);
    minY = Math.min(minY, y - size);
    maxX = Math.max(maxX, x + size);
    maxY = Math.max(maxY, y + size);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
