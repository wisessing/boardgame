import { enumeratePolyhexes } from "./polyhex.js";
import { ALL_EDGES, buildGraph } from "./tile.js";
import { renderPolyhex, renderAbstractGraph, degreeSequence } from "./render.js";

const galleryEl = document.getElementById("gallery");
const countEl = document.getElementById("count");
const timingEl = document.getElementById("timing");

const N = Number(document.body.dataset.n);
if (!Number.isInteger(N) || N < 1) {
  throw new Error(`Missing or invalid <body data-n="…">: got ${document.body.dataset.n}`);
}

function setTiming(parts) {
  timingEl.textContent = parts
    .filter((p) => p)
    .map((p) => `${p.label}: ${p.ms.toFixed(1)} ms`)
    .join("  ·  ");
}

// Brute-force graph isomorphism canonical form: lexicographically smallest
// upper-triangular adjacency string over all vertex permutations. Fine for
// n <= 7 (7! = 5040 perms per graph).
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function canonicalForm(graph) {
  const n = graph.nodes.length;
  const adj = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of graph.internalEdges) {
    adj[e.a][e.b] = 1;
    adj[e.b][e.a] = 1;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  let best = null;
  for (const p of permutations(idx)) {
    let s = "";
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) s += adj[p[i]][p[j]];
    if (best === null || s < best) best = s;
  }
  return `${n}:${best}`;
}

function buildGroups(shapes) {
  const map = new Map();
  for (const cells of shapes) {
    const tiles = cells.map(() => ALL_EDGES);
    const graph = buildGraph(cells, tiles);
    const key = canonicalForm(graph);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(cells);
  }
  return Array.from(map.entries())
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => b.members.length - a.members.length || (a.key < b.key ? -1 : 1));
}

function renderGrouped(groups) {
  galleryEl.innerHTML = "";
  groups.forEach((group, gIdx) => {
    const section = document.createElement("section");
    section.className = "group";

    const repCells = group.members[0];
    const repTiles = repCells.map(() => ALL_EDGES);
    const repGraph = buildGraph(repCells, repTiles);
    const degSeq = degreeSequence(repGraph);

    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML =
      `<span class="group-title">Group #${gIdx + 1}</span> · ` +
      `${group.members.length} polyhex${group.members.length === 1 ? "" : "es"} · ` +
      `|V| = ${repGraph.nodes.length}, |E| = ${repGraph.internalEdges.length} · ` +
      `<span class="degseq">deg = (${degSeq.join(", ")})</span>`;
    section.appendChild(header);

    const row = document.createElement("div");
    row.className = "group-row";

    const graphRender = renderAbstractGraph({ cells: repCells, tiles: repTiles });
    const gcard = document.createElement("div");
    gcard.className = "card graph-card group-graph";
    gcard.appendChild(graphRender.svg);
    const glabel = document.createElement("div");
    glabel.className = "label";
    glabel.textContent = "abstract graph";
    gcard.appendChild(glabel);
    row.appendChild(gcard);

    group.members.forEach((cells, idx) => {
      const tiles = cells.map(() => ALL_EDGES);
      const tileRender = renderPolyhex({ cells, tiles });
      const card = document.createElement("div");
      card.className = "card";
      const intCount = tileRender.graph.internalEdges.length;
      const extCount = tileRender.graph.externalEdges.length;
      const label = document.createElement("div");
      label.className = "label";
      label.textContent =
        `#${idx + 1} · ${cells.length} tiles · ${intCount} int · ${extCount} ext`;
      card.appendChild(tileRender.svg);
      card.appendChild(label);
      row.appendChild(card);
    });

    section.appendChild(row);
    galleryEl.appendChild(section);
  });
}

const t0 = performance.now();
const shapes = enumeratePolyhexes(N);
const t1 = performance.now();
const groups = buildGroups(shapes);
const t2 = performance.now();
countEl.textContent =
  `N = ${N} · ${shapes.length} polyhex${shapes.length === 1 ? "" : "es"}` +
  ` · ${groups.length} unique graph${groups.length === 1 ? "" : "s"}`;
renderGrouped(groups);
const t3 = performance.now();
void galleryEl.offsetHeight;
const t4 = performance.now();
setTiming([
  { label: "enumerate", ms: t1 - t0 },
  { label: "group", ms: t2 - t1 },
  { label: "build DOM", ms: t3 - t2 },
  { label: "layout", ms: t4 - t3 },
  { label: "total", ms: t4 - t0 },
]);
