// Free polyhex enumeration — connected sets of N hex cells, deduped under the
// 12-element dihedral hex symmetry group (rotations + reflections).
// Counts: N=1:1, N=2:1, N=3:3, N=4:7, N=5:22.

import { NEIGHBORS, applySymmetry, normalize } from "./hex.js";

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

export function enumeratePolyhexes(n) {
  if (n < 1) return [];
  const seen = new Set();
  const results = [];

  const cells = [[0, 0]];
  const cellSet = new Set(["0,0"]);

  function grow() {
    if (cells.length === n) {
      const k = canonicalKey(cells);
      if (!seen.has(k)) {
        seen.add(k);
        results.push(normalize(cells.map(([q, r]) => [q, r])));
      }
      return;
    }
    // Frontier: all empty neighbors of current cells.
    const frontier = new Set();
    for (const [q, r] of cells) {
      for (const [dq, dr] of NEIGHBORS) {
        const nq = q + dq, nr = r + dr;
        const k = `${nq},${nr}`;
        if (!cellSet.has(k)) frontier.add(k);
      }
    }
    for (const f of frontier) {
      const [nq, nr] = f.split(",").map(Number);
      cells.push([nq, nr]);
      cellSet.add(f);
      grow();
      cells.pop();
      cellSet.delete(f);
    }
  }

  grow();
  return results;
}
