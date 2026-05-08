// SVG renderer for a polyhex configuration.
// Draws: hex outlines, dangling external edges (half-segments to side midpoints),
// internal edges (full segments through shared midpoints), center nodes on top.
//
// Also exports renderAbstractGraph: the pure V/E view (no hex outlines, no
// dangling edges, labeled nodes) — same axial layout so it lines up with the
// tile view.

import { axialToPixel, hexCorners, sideMidpoint, bbox } from "./hex.js";
import { buildGraph } from "./tile.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function renderPolyhex({ cells, tiles, size = 28, padding = 8 }) {
  const svg = el("svg", { class: "polyhex" });

  // Compute viewBox.
  const box = bbox(cells, size);
  const vb = {
    x: box.minX - padding,
    y: box.minY - padding,
    w: box.w + padding * 2,
    h: box.h + padding * 2,
  };
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const graph = buildGraph(cells, tiles);

  // Layer 1: hex outlines.
  const hexLayer = el("g", { class: "hex-layer" });
  for (const [q, r] of cells) {
    const { x, y } = axialToPixel(q, r, size);
    const corners = hexCorners(x, y, size);
    const d = corners
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ") + " Z";
    hexLayer.appendChild(
      el("path", { d, class: "hex-outline" })
    );
  }
  svg.appendChild(hexLayer);

  // Layer 2: edges.
  const edgeLayer = el("g", { class: "edge-layer" });

  // External (dangling): center -> side midpoint
  for (const e of graph.externalEdges) {
    const node = graph.nodes[e.a];
    const c = axialToPixel(node.q, node.r, size);
    const m = sideMidpoint(c.x, c.y, size, e.side);
    edgeLayer.appendChild(
      el("line", {
        x1: c.x.toFixed(2),
        y1: c.y.toFixed(2),
        x2: m.x.toFixed(2),
        y2: m.y.toFixed(2),
        class: "edge external",
      })
    );
  }

  // Internal: center A -> midpoint -> center B (drawn as a single straight
  // line A->B since center, shared midpoint, neighbor center are colinear).
  for (const e of graph.internalEdges) {
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const ca = axialToPixel(a.q, a.r, size);
    const cb = axialToPixel(b.q, b.r, size);
    edgeLayer.appendChild(
      el("line", {
        x1: ca.x.toFixed(2),
        y1: ca.y.toFixed(2),
        x2: cb.x.toFixed(2),
        y2: cb.y.toFixed(2),
        class: "edge internal",
      })
    );
  }
  svg.appendChild(edgeLayer);

  // Layer 3: center nodes on top.
  const nodeLayer = el("g", { class: "node-layer" });
  for (const node of graph.nodes) {
    const { x, y } = axialToPixel(node.q, node.r, size);
    nodeLayer.appendChild(
      el("circle", {
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: (size * 0.18).toFixed(2),
        class: "node",
      })
    );
  }
  svg.appendChild(nodeLayer);

  return { svg, graph };
}

// Abstract graph view: just nodes (labeled) and edges. Layout uses axial
// coords so the abstract graph lines up positionally with the tile rendering.
export function renderAbstractGraph({
  cells,
  tiles,
  size = 28,
  padding = 16,
}) {
  const svg = el("svg", { class: "polyhex graph-only" });

  const box = bbox(cells, size);
  const vb = {
    x: box.minX - padding,
    y: box.minY - padding,
    w: box.w + padding * 2,
    h: box.h + padding * 2,
  };
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const graph = buildGraph(cells, tiles);

  // Edges (internal only — external edges aren't graph edges in V/E terms).
  const edgeLayer = el("g", { class: "edge-layer" });
  for (const e of graph.internalEdges) {
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const ca = axialToPixel(a.q, a.r, size);
    const cb = axialToPixel(b.q, b.r, size);
    edgeLayer.appendChild(
      el("line", {
        x1: ca.x.toFixed(2),
        y1: ca.y.toFixed(2),
        x2: cb.x.toFixed(2),
        y2: cb.y.toFixed(2),
        class: "graph-edge",
      })
    );
  }
  svg.appendChild(edgeLayer);

  // Nodes with labels.
  const nodeLayer = el("g", { class: "node-layer" });
  const r = size * 0.32;
  for (const node of graph.nodes) {
    const { x, y } = axialToPixel(node.q, node.r, size);
    nodeLayer.appendChild(
      el("circle", {
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: r.toFixed(2),
        class: "graph-node",
      })
    );
    const text = el("text", {
      x: x.toFixed(2),
      y: y.toFixed(2),
      class: "graph-node-label",
    });
    text.textContent = String(node.id + 1);
    nodeLayer.appendChild(text);
  }
  svg.appendChild(nodeLayer);

  return { svg, graph };
}

// Compute degree sequence (sorted descending) of the abstract graph
// (internal edges only).
export function degreeSequence(graph) {
  const deg = new Array(graph.nodes.length).fill(0);
  for (const e of graph.internalEdges) {
    deg[e.a]++;
    deg[e.b]++;
  }
  return deg.slice().sort((a, b) => b - a);
}
