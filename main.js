import { enumeratePolyhexes } from "./polyhex.js";
import { ALL_EDGES, buildGraph } from "./tile.js";
import { renderPolyhex, renderAbstractGraph, degreeSequence } from "./render.js";

const tabs = document.querySelectorAll(".tab[data-n]");
const galleryEl = document.getElementById("gallery");
const countEl = document.getElementById("count");
const showBtn = document.getElementById("show-grouped");

const shapeCache = new Map();
function shapesFor(n) {
  if (!shapeCache.has(n)) shapeCache.set(n, enumeratePolyhexes(n));
  return shapeCache.get(n);
}

// Brute-force graph isomorphism canonical form: lexicographically smallest
// upper-triangular adjacency string over all vertex permutations. Fine for
// n <= 6 (6! = 720 perms per graph).
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

const groupCache = new Map();
function groupsFor(n) {
  if (groupCache.has(n)) return groupCache.get(n);
  const shapes = shapesFor(n);
  const map = new Map();
  for (const cells of shapes) {
    const tiles = cells.map(() => ALL_EDGES);
    const graph = buildGraph(cells, tiles);
    const key = canonicalForm(graph);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(cells);
  }
  // Sort groups by descending member count, then by canonical key for stability.
  const groups = Array.from(map.entries())
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => b.members.length - a.members.length || (a.key < b.key ? -1 : 1));
  groupCache.set(n, groups);
  return groups;
}

function renderGrouped(groups) {
  galleryEl.innerHTML = "";
  groups.forEach((group, gIdx) => {
    const section = document.createElement("section");
    section.className = "group";

    // Compute graph stats from the first representative.
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

    // Graph card first.
    const graphRender = renderAbstractGraph({ cells: repCells, tiles: repTiles });
    const gcard = document.createElement("div");
    gcard.className = "card graph-card group-graph";
    gcard.appendChild(graphRender.svg);
    const glabel = document.createElement("div");
    glabel.className = "label";
    glabel.textContent = "abstract graph";
    gcard.appendChild(glabel);
    row.appendChild(gcard);

    // Then each polyhex that maps to this graph.
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

// Bumped whenever the current N changes — used to cancel in-flight renders.
let renderToken = 0;
let currentN = null;
let currentGroups = [];
let currentShapeCount = 0;
let shown = false;

function showLabel() {
  return `Show ${currentShapeCount} polyhex${currentShapeCount === 1 ? "" : "es"}` +
    ` grouped by ${currentGroups.length} graph${currentGroups.length === 1 ? "" : "s"}`;
}

function showN(n) {
  renderToken++;
  currentN = n;
  const shapes = shapesFor(n);
  currentGroups = groupsFor(n);
  currentShapeCount = shapes.length;
  countEl.textContent =
    `N = ${n} · ${shapes.length} polyhex${shapes.length === 1 ? "" : "es"}` +
    ` · ${currentGroups.length} unique graph${currentGroups.length === 1 ? "" : "s"}`;
  galleryEl.innerHTML = "";
  shown = false;
  showBtn.textContent = showLabel();
  showBtn.disabled = false;
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    showN(Number(tab.dataset.n));
  });
});

showBtn.addEventListener("click", () => {
  if (shown) {
    galleryEl.innerHTML = "";
    shown = false;
    showBtn.textContent = showLabel();
    return;
  }
  const myToken = renderToken;
  const groups = currentGroups;
  showBtn.disabled = true;
  showBtn.textContent = `Rendering N=${currentN}…`;
  requestAnimationFrame(() => {
    if (myToken !== renderToken) return;
    renderGrouped(groups);
    shown = true;
    showBtn.disabled = false;
    showBtn.textContent = "Hide";
  });
});

// Default tab — set state but render nothing.
showN(3);
