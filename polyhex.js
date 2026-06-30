// Free polyhex enumeration — connected sets of N hex cells in which every
// cell shares an edge with at least 3 other cells in the set; deduped
// under the 12-element dihedral hex symmetry group (rotations + reflections).
//
// Strategy: level-wise BFS with per-level dedup by canonical D6 key. This
// avoids the N! blow-up of "any DFS path from a seed cell" and makes N=12
// tractable.
// Counts (degree>=3): N=7:1, N=8..9:0, N=10:1, N=11:0, N=12:3.

import { NEIGHBORS, applySymmetry, normalize } from "./hex.js";

const MIN_DEGREE = 3;

function everyCellHasMinDegree(cells, cellSet) {
  for (const [q, r] of cells) {
    let count = 0;
    for (const [dq, dr] of NEIGHBORS) {
      if (cellSet.has(`${q + dq},${r + dr}`)) {
        count++;
        if (count >= MIN_DEGREE) break;
      }
    }
    if (count < MIN_DEGREE) return false;
  }
  return true;
}

function canonicalKey(cells) {
  let best = null;
  for (let mirror = 0; mirror < 2; mirror++) {
    for (let rot = 0; rot < 6; rot++) {
      const transformed = applySymmetry(cells, rot, mirror === 1);
      const norm = normalize(transformed);
      const s = norm.map(([q, r]) => `${q},${r}`).join("|");
      if (best === null || s < best) best = s;
    }
  }
  return best;
}

// Enumerate all free polyhexes of size exactly n, then apply the degree filter.
// Builds size 1 -> 2 -> ... -> n, deduping at each level via canonical key.
export function enumeratePolyhexes(n) {
  if (n < 1) return [];

  let current = [normalize([[0, 0]])];

  for (let k = 1; k < n; k++) {
    const seen = new Set();
    const next = [];
    for (const cells of current) {
      const cellKeys = new Set();
      for (const [q, r] of cells) cellKeys.add(`${q},${r}`);
      const frontier = new Set();
      for (const [q, r] of cells) {
        for (const [dq, dr] of NEIGHBORS) {
          const fk = `${q + dq},${r + dr}`;
          if (!cellKeys.has(fk)) frontier.add(fk);
        }
      }
      for (const fk of frontier) {
        const [nq, nr] = fk.split(",").map(Number);
        const newCells = cells.concat([[nq, nr]]);
        const key = canonicalKey(newCells);
        if (!seen.has(key)) {
          seen.add(key);
          next.push(normalize(newCells));
        }
      }
    }
    current = next;
  }

  return current.filter((cells) => {
    const cellSet = new Set();
    for (const [q, r] of cells) cellSet.add(`${q},${r}`);
    return everyCellHasMinDegree(cells, cellSet);
  });
}
