// Tile = subset of {0..5} indicating which sides have an edge from the center.
// Stored as a 6-bit integer: bit i is 1 iff side i has an edge.

import { NEIGHBORS, OPPOSITE_SIDE, key } from "./hex.js";

export const ALL_EDGES = 0b111111; // tile with edges on all 6 sides

export function tileFromSides(sides) {
  let t = 0;
  for (const s of sides) t |= 1 << s;
  return t;
}

export function tileSides(t) {
  const out = [];
  for (let i = 0; i < 6; i++) if (t & (1 << i)) out.push(i);
  return out;
}

export function tileDegree(t) {
  let n = 0;
  for (let i = 0; i < 6; i++) if (t & (1 << i)) n++;
  return n;
}

// Rotate a tile by `r` increments of 60° (so side i moves to side (i+r)%6).
export function rotateTile(t, r) {
  let out = 0;
  for (let i = 0; i < 6; i++) {
    if (t & (1 << i)) out |= 1 << ((i + r) % 6);
  }
  return out;
}

// Build the graph for a placement: cells = [[q, r], ...], tiles = same-length
// array of tile bitmasks (one per cell).
//
// Graph model:
//   - Node per cell center, identified by axial (q, r).
//   - Internal edge between two adjacent cells iff BOTH cells have an edge on
//     their shared side. (The two segments meet at the shared side-midpoint
//     and form one continuous line center—midpoint—center.)
//   - External (dangling) edge: a side-edge whose neighbor is absent OR whose
//     neighbor has no edge on the shared side. Rendered as a half-segment from
//     the center to the side midpoint.
export function buildGraph(cells, tiles) {
  const cellMap = new Map();
  cells.forEach((c, i) => cellMap.set(key(c[0], c[1]), i));

  const nodes = cells.map(([q, r], i) => ({
    id: i,
    q,
    r,
    tile: tiles[i],
  }));

  const internalEdges = []; // {a, b, sideA, sideB}
  const externalEdges = []; // {a, side}
  const seenPair = new Set();

  for (let i = 0; i < cells.length; i++) {
    const [q, r] = cells[i];
    const t = tiles[i];
    for (let s = 0; s < 6; s++) {
      if (!(t & (1 << s))) continue;
      const [dq, dr] = NEIGHBORS[s];
      const nKey = key(q + dq, r + dr);
      const j = cellMap.get(nKey);
      if (j === undefined) {
        externalEdges.push({ a: i, side: s });
        continue;
      }
      const opp = OPPOSITE_SIDE[s];
      if (!(tiles[j] & (1 << opp))) {
        // neighbor exists but has no edge on the shared side -> dangling
        externalEdges.push({ a: i, side: s });
        continue;
      }
      // both have edges -> internal edge between cell i and j.
      // dedupe (i, j) unordered pair
      const pairKey = i < j ? `${i},${j}` : `${j},${i}`;
      if (seenPair.has(pairKey)) continue;
      seenPair.add(pairKey);
      internalEdges.push({ a: i, b: j, sideA: s, sideB: opp });
    }
  }

  return { nodes, internalEdges, externalEdges };
}
