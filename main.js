import { enumeratePolyhexes } from "./polyhex.js";
import { ALL_EDGES } from "./tile.js";
import { renderPolyhex, renderAbstractGraph, degreeSequence } from "./render.js";
import { exportSvgAsPng } from "./export.js";

const tabs = document.querySelectorAll(".tab");
const galleryEl = document.getElementById("gallery");
const graphGalleryEl = document.getElementById("graph-gallery");
const countEl = document.getElementById("count");
const downloadAllBtn = document.getElementById("download-all");

const cache = new Map();
function shapesFor(n) {
  if (!cache.has(n)) cache.set(n, enumeratePolyhexes(n));
  return cache.get(n);
}

let currentN = 3;

function makeExportBtn(svg, filename) {
  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.type = "button";
  btn.textContent = "PNG";
  btn.title = "Download as PNG";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await exportSvgAsPng(svg, filename);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function showN(n) {
  currentN = n;
  const shapes = shapesFor(n);
  countEl.textContent = `N = ${n} · ${shapes.length} shape${shapes.length === 1 ? "" : "s"}`;
  galleryEl.innerHTML = "";
  graphGalleryEl.innerHTML = "";

  shapes.forEach((cells, idx) => {
    const tiles = cells.map(() => ALL_EDGES);

    // Tile view card.
    const tileRender = renderPolyhex({ cells, tiles });
    const card = document.createElement("div");
    card.className = "card";
    card.appendChild(makeExportBtn(tileRender.svg, `polyhex-N${n}-${idx + 1}.png`));
    const intCount = tileRender.graph.internalEdges.length;
    const extCount = tileRender.graph.externalEdges.length;
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = `#${idx + 1} · ${cells.length} tiles · ${intCount} internal · ${extCount} external`;
    card.appendChild(tileRender.svg);
    card.appendChild(label);
    galleryEl.appendChild(card);

    // Abstract graph card.
    const graphRender = renderAbstractGraph({ cells, tiles });
    const gcard = document.createElement("div");
    gcard.className = "card graph-card";
    gcard.appendChild(makeExportBtn(graphRender.svg, `graph-N${n}-${idx + 1}.png`));
    const degSeq = degreeSequence(graphRender.graph);
    const glabel = document.createElement("div");
    glabel.className = "label";
    glabel.innerHTML =
      `#${idx + 1} · |V| = ${graphRender.graph.nodes.length}, ` +
      `|E| = ${graphRender.graph.internalEdges.length}` +
      `<br/><span class="degseq">deg = (${degSeq.join(", ")})</span>`;
    gcard.appendChild(graphRender.svg);
    gcard.appendChild(glabel);
    graphGalleryEl.appendChild(gcard);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    showN(Number(tab.dataset.n));
  });
});

downloadAllBtn.addEventListener("click", async () => {
  downloadAllBtn.disabled = true;
  const original = downloadAllBtn.textContent;
  try {
    const tasks = [];
    galleryEl.querySelectorAll(".card svg.polyhex").forEach((svg, i) => {
      tasks.push({ svg, name: `polyhex-N${currentN}-${i + 1}.png` });
    });
    graphGalleryEl.querySelectorAll(".card svg.polyhex").forEach((svg, i) => {
      tasks.push({ svg, name: `graph-N${currentN}-${i + 1}.png` });
    });
    for (let i = 0; i < tasks.length; i++) {
      downloadAllBtn.textContent = `Exporting ${i + 1}/${tasks.length}…`;
      await exportSvgAsPng(tasks[i].svg, tasks[i].name);
      await new Promise((r) => setTimeout(r, 120));
    }
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = original;
  }
});

// Default tab
showN(3);
