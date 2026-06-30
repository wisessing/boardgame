import { POLYHEX_DATA } from "./polyhex-data.js";
import { ALL_EDGES, buildGraph } from "./tile.js";
import { renderPolyhex, renderAbstractGraph, degreeSequence } from "./render.js";

const galleryEl = document.getElementById("gallery");
const countEl = document.getElementById("count");
const timingEl = document.getElementById("timing");
const verifyEl = document.getElementById("verify");

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

// Group polyhexes by VF2-derived label (precomputed offline in
// polyhex-groups.json — see verify_groups.py). WL refinement was
// incomplete at N >= 15 and was collapsing non-isomorphic graphs.
function buildGroupsFromLabels(shapes, labels) {
  const map = new Map();
  for (let i = 0; i < shapes.length; i++) {
    const key = labels[i] ?? `solo-${i}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(shapes[i]);
  }
  return Array.from(map.entries())
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => b.members.length - a.members.length || a.key - b.key);
}

function renderGrouped(groups) {
  galleryEl.innerHTML = "";
  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent =
      `No polyhex of size ${N} satisfies the rule (every cell shares ` +
      `an edge with at least 3 others in the set).`;
    galleryEl.appendChild(empty);
    return;
  }
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

const shapes = POLYHEX_DATA[N] || [];

// Load precomputed VF2 group labels.
const groupLabelsByN = await fetch("polyhex-groups.json").then((r) => r.json());
const myLabels = groupLabelsByN[String(N)]?.labels ?? shapes.map((_, i) => i);

const t0 = performance.now();
const groups = buildGroupsFromLabels(shapes, myLabels);
const t1 = performance.now();
countEl.textContent =
  `N = ${N} · ${shapes.length} polyhex${shapes.length === 1 ? "" : "es"}` +
  ` · ${groups.length} unique graph${groups.length === 1 ? "" : "s"}`;
renderGrouped(groups);
const t2 = performance.now();
void galleryEl.offsetHeight;
const t3 = performance.now();
setTiming([
  { label: "group", ms: t1 - t0 },
  { label: "build DOM", ms: t2 - t1 },
  { label: "layout", ms: t3 - t2 },
  { label: "total", ms: t3 - t0 },
]);

// Fetch independent verifications (GPU brute force + CP-SAT) and decorate
// the count line. Each verifier covers a different N range, so we report
// every source that has a number for the current N.
if (verifyEl) {
  Promise.all([
    fetch("verification.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("verification-cpsat.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([gpu, cpsat]) => {
    const lines = [];
    let anyMismatch = false;
    let anyOk = false;
    const check = (label, src) => {
      if (!src || !src.counts) return;
      const row = src.counts[String(N)];
      if (!row) return;
      const v = row.valid_polyhexes;
      const ok = v === shapes.length;
      if (ok) anyOk = true; else anyMismatch = true;
      lines.push(
        ok
          ? `✓ ${label}: ${v} valid`
          : `✗ ${label} MISMATCH: ${v} vs smart ${shapes.length}`,
      );
    };
    check("GPU brute force", gpu);
    check("CP-SAT", cpsat);
    if (lines.length === 0) {
      verifyEl.textContent = "not independently verified";
      verifyEl.className = "verify unverified";
    } else {
      verifyEl.textContent = lines.join("  ·  ");
      verifyEl.className =
        "verify " + (anyMismatch ? "mismatch" : "ok");
    }
  });
}
