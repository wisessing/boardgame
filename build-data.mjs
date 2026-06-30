// Constraint-propagating enumerator for free polyhexes of size N with
// every cell sharing edges with >= 3 in-set neighbours.
//
// Idea: backtrack on cells reachable from a fixed seed (0,0). At every
// decision we propagate "this included cell can still reach degree 3"
// and "this included cell already has its 3 neighbours pinned" — branches
// that violate either rule are pruned immediately. Because valid polyhexes
// are very rare, the search tree stays small even at N = 18.
//
// Run:  node build-data.mjs <maxN>

import { writeFileSync } from "fs";

const NEIGHBORS = [
  [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
];
const MIN_DEGREE = 3;

const ck = (q, r) => `${q},${r}`;

// Lex order on (r, q). Cells "after" the seed satisfy r > 0 or (r = 0, q > 0).
// We fix the seed at (0,0) and require every other included cell to be after
// it, so each free polyhex is enumerated only over translations whose lex-min
// cell sits at (0,0). (D6 symmetry is still deduped at the end.)
const afterSeed = (q, r) => r > 0 || (r === 0 && q > 0);

function applySymmetry(cells, rot, mirror) {
  return cells.map(([q, r]) => {
    let a = q, b = r;
    if (mirror) { a = a + b; b = -b; }
    for (let i = 0; i < rot; i++) { const na = -b; const nb = a + b; a = na; b = nb; }
    return [a, b];
  });
}

function normalize(cells) {
  const sorted = cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [minQ, minR] = sorted[0];
  return sorted.map(([q, r]) => [q - minQ, r - minR]);
}

function canonicalKey(cells) {
  let best = null;
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 6; r++) {
      const t = applySymmetry(cells, r, m === 1);
      const n = normalize(t);
      const s = n.map(([q, rr]) => `${q},${rr}`).join("|");
      if (best === null || s < best) best = s;
    }
  }
  return best;
}

function enumerateDeg3(N) {
  if (N < 1) return [];
  if (N === 1) return []; // a single cell has degree 0; infeasible under the rule

  const included = new Map();   // key -> [q, r]
  const excluded = new Set();   // keys
  const degree = new Map();     // key -> current included-degree

  function include(q, r) {
    const k = ck(q, r);
    let d = 0;
    for (const [dq, dr] of NEIGHBORS) {
      const nk = ck(q + dq, r + dr);
      if (included.has(nk)) {
        d++;
        degree.set(nk, degree.get(nk) + 1);
      }
    }
    degree.set(k, d);
    included.set(k, [q, r]);
  }

  function unInclude(q, r) {
    const k = ck(q, r);
    included.delete(k);
    degree.delete(k);
    for (const [dq, dr] of NEIGHBORS) {
      const nk = ck(q + dq, r + dr);
      if (included.has(nk)) degree.set(nk, degree.get(nk) - 1);
    }
  }

  // Feasibility: every included cell must still be able to reach degree >= 3
  // using its currently-undecided neighbours.
  function feasible() {
    for (const [k, [q, r]] of included) {
      const d = degree.get(k);
      if (d >= MIN_DEGREE) continue;
      let und = 0;
      for (const [dq, dr] of NEIGHBORS) {
        const nq = q + dq, nr = r + dr;
        // Cells strictly before the seed are implicitly excluded.
        if (!afterSeed(nq, nr) && !(nq === 0 && nr === 0)) continue;
        const nk = ck(nq, nr);
        if (!included.has(nk) && !excluded.has(nk)) und++;
      }
      if (d + und < MIN_DEGREE) return false;
    }
    return true;
  }

  const results = [];

  function recurse(frontier) {
    if (included.size === N) {
      for (const d of degree.values()) if (d < MIN_DEGREE) return;
      results.push(Array.from(included.values()).map((c) => [c[0], c[1]]));
      return;
    }
    if (frontier.length === 0) return;

    const [q, r] = frontier[0];
    const rest = frontier.slice(1);
    const cellKey = ck(q, r);

    // Branch A: include the cell (only if it's after the seed).
    if (afterSeed(q, r)) {
      include(q, r);
      if (feasible() && included.size <= N) {
        const newFrontier = rest.slice();
        const seenInFrontier = new Set(rest.map(([a, b]) => ck(a, b)));
        for (const [dq, dr] of NEIGHBORS) {
          const nq = q + dq, nr = r + dr;
          if (!afterSeed(nq, nr)) continue;
          const nk = ck(nq, nr);
          if (included.has(nk) || excluded.has(nk) || seenInFrontier.has(nk)) continue;
          newFrontier.push([nq, nr]);
          seenInFrontier.add(nk);
        }
        recurse(newFrontier);
      }
      unInclude(q, r);
    }

    // Branch B: exclude the cell.
    excluded.add(cellKey);
    if (feasible()) recurse(rest);
    excluded.delete(cellKey);
  }

  include(0, 0);
  const initialFrontier = [];
  const seenInitial = new Set();
  for (const [dq, dr] of NEIGHBORS) {
    if (!afterSeed(dq, dr)) continue;
    const k = ck(dq, dr);
    if (seenInitial.has(k)) continue;
    initialFrontier.push([dq, dr]);
    seenInitial.add(k);
  }
  recurse(initialFrontier);
  unInclude(0, 0);

  // Dedup by D6 symmetry.
  const seen = new Set();
  const unique = [];
  for (const cells of results) {
    const k = canonicalKey(cells);
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(normalize(cells));
    }
  }
  return unique;
}

const maxN = Number(process.argv[2] ?? 18);
const data = {};
const t0wall = Date.now();
for (let N = 7; N <= maxN; N++) {
  const t = Date.now();
  data[N] = enumerateDeg3(N);
  const ms = Date.now() - t;
  console.error(`N=${N}: ${data[N].length} valid polyhex(es) [${ms} ms]`);
  const out =
    "// Pre-computed polyhexes for the degree>=3 rule. Generated; do not edit.\n" +
    `// Built through N = ${N} (max requested: ${maxN}).\n\n` +
    "export const POLYHEX_DATA = " + JSON.stringify(data) + ";\n";
  writeFileSync("polyhex-data.js", out);
}
console.error(`done in ${(Date.now() - t0wall) / 1000} s`);
