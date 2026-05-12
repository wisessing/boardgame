// SVG renderer for a polyhex configuration.
//
// Slim DOM: each polyhex card is one <polygon> per hex plus one <line> per
// internal connector. No external (dangling) edges, no center-dot circles,
// no <g> layer wrappers — those were cosmetic for ALL_EDGES tiles.
// The abstract-graph card is one <line> per edge plus <circle>+<text> per node.

import { axialToPixel, hexCorners, bbox } from "./hex.js";
import { buildGraph } from "./tile.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function setViewBox(svg, cells, size, padding) {
  const box = bbox(cells, size);
  const w = box.w + padding * 2;
  const h = box.h + padding * 2;
  svg.setAttribute(
    "viewBox",
    `${box.minX - padding} ${box.minY - padding} ${w} ${h}`,
  );
  // Render at natural (1:1) size — every hex is the same size on screen
  // regardless of how many cells the polyhex has.
  svg.setAttribute("width", w.toFixed(2));
  svg.setAttribute("height", h.toFixed(2));
}

function hexPolygonPoints(q, r, size) {
  const { x, y } = axialToPixel(q, r, size);
  return hexCorners(x, y, size)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function appendInternalEdges(svg, graph, size, lineClass) {
  for (const e of graph.internalEdges) {
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const ca = axialToPixel(a.q, a.r, size);
    const cb = axialToPixel(b.q, b.r, size);
    svg.appendChild(el("line", {
      x1: ca.x.toFixed(2),
      y1: ca.y.toFixed(2),
      x2: cb.x.toFixed(2),
      y2: cb.y.toFixed(2),
      class: lineClass,
    }));
  }
}

export function renderPolyhex({ cells, tiles, size = 28, padding = 8 }) {
  const svg = el("svg", { class: "polyhex" });
  setViewBox(svg, cells, size, padding);
  const graph = buildGraph(cells, tiles);

  for (const [q, r] of cells) {
    svg.appendChild(el("polygon", {
      points: hexPolygonPoints(q, r, size),
      class: "hex-outline",
    }));
  }
  appendInternalEdges(svg, graph, size, "edge internal");
  return { svg, graph };
}

export function renderAbstractGraph({ cells, tiles, size = 28, padding = 16 }) {
  const svg = el("svg", { class: "polyhex graph-only" });
  setViewBox(svg, cells, size, padding);
  const graph = buildGraph(cells, tiles);

  appendInternalEdges(svg, graph, size, "graph-edge");

  const r = (size * 0.32).toFixed(2);
  for (const node of graph.nodes) {
    const { x, y } = axialToPixel(node.q, node.r, size);
    const cx = x.toFixed(2);
    const cy = y.toFixed(2);
    svg.appendChild(el("circle", { cx, cy, r, class: "graph-node" }));
    const text = el("text", { x: cx, y: cy, class: "graph-node-label" });
    text.textContent = String(node.id + 1);
    svg.appendChild(text);
  }
  return { svg, graph };
}

export function degreeSequence(graph) {
  const deg = new Array(graph.nodes.length).fill(0);
  for (const e of graph.internalEdges) {
    deg[e.a]++;
    deg[e.b]++;
  }
  return deg.slice().sort((a, b) => b - a);
}
