// PNG export for SVG elements.
// Off-document rasterization (Image + canvas) ignores external stylesheets,
// so we clone the SVG, inline the visual styles, add a background rect,
// then draw it onto a canvas at a configurable scale.

const SVG_NS = "http://www.w3.org/2000/svg";

const INLINE_STYLE = `
  .hex-outline { fill: #1b1e26; stroke: #2a2f3a; stroke-width: 1; }
  .edge { stroke-linecap: round; fill: none; }
  .edge.internal { stroke: #6ea8fe; stroke-width: 2.4; }
  .edge.external { stroke: #f5a76b; stroke-width: 2.4; opacity: 0.85; }
  .node { fill: #e6e8ef; stroke: #0f1115; stroke-width: 1; }
  .graph-edge { stroke: #cdd2dd; stroke-width: 2; stroke-linecap: round; fill: none; }
  .graph-node { fill: #6ea8fe; stroke: #0f1115; stroke-width: 1.5; }
  .graph-node-label {
    fill: #0b0e13;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 10px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
  }
`;

function prepareSvgForExport(srcSvg, { scale = 3, bg = "#171a21" } = {}) {
  const clone = srcSvg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);

  const vb = clone.getAttribute("viewBox").split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vb;
  const outW = Math.round(vw * scale);
  const outH = Math.round(vh * scale);
  clone.setAttribute("width", outW);
  clone.setAttribute("height", outH);

  // Background rect — first child so it sits behind everything.
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", vx);
  rect.setAttribute("y", vy);
  rect.setAttribute("width", vw);
  rect.setAttribute("height", vh);
  rect.setAttribute("fill", bg);
  clone.insertBefore(rect, clone.firstChild);

  // Inline styles.
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = INLINE_STYLE;
  clone.insertBefore(style, clone.firstChild);

  return { clone, outW, outH };
}

export async function svgToPngBlob(srcSvg, opts = {}) {
  const { clone, outW, outH } = prepareSvgForExport(srcSvg, opts);
  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, outW, outH);

    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSvgAsPng(srcSvg, filename, opts = {}) {
  const blob = await svgToPngBlob(srcSvg, opts);
  downloadBlob(blob, filename);
}
