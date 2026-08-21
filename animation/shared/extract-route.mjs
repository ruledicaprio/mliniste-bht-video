// Extracts the highlighted M-15 (Glamoč–Livno, via Mlinište pass) corridor
// from artifacts/bih-motorway-m15-glamoc-livno-segment.svg into route.json.
//
// The corridor is the group `g3922` in that SVG — the hand-drawn markup
// stroked #803300 at width 5, sitting on top of the #ff6600 magistralni network.
// It is authored as three sub-paths with small gaps; we join them head-to-tail
// into one polyline so the intro can trace it as a single continuous route.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToPoints } from './svg-path.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = resolve(HERE, '../../artifacts/bih-motorway-m15-glamoc-livno-segment.svg');
const OUT = resolve(HERE, 'route.json');
const GROUP_ID = 'g3922';

/**
 * Returns the markup of the element starting at `start`, balancing nested tags
 * of the same name. Slicing to the first `</g>` truncates the corridor the
 * moment Inkscape wraps anything in a sub-group.
 */
export function sliceElement(svg, start, tag = 'g') {
  const open = new RegExp(`<${tag}\\b`, 'g');
  const close = new RegExp(`</${tag}\\s*>`, 'g');
  open.lastIndex = start;
  close.lastIndex = start;

  let depth = 0;
  let cursor = start;
  for (;;) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const o = open.exec(svg);
    const c = close.exec(svg);
    if (!c) throw new Error(`unterminated <${tag}> starting at offset ${start}`);

    if (o && o.index < c.index) {
      depth++;
      cursor = o.index + o[0].length;
    } else {
      depth--;
      cursor = c.index + c[0].length;
      if (depth === 0) return svg.slice(start, c.index);
    }
  }
}

export function extractRoute(svg, { sourceLabel = '' } = {}) {
  const vbMatch = /<svg\b[^>]*?\sviewBox="([^"]+)"/s.exec(svg);
  if (!vbMatch) throw new Error('no viewBox on the root <svg> element');
  const viewBox = vbMatch[1].trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) {
    throw new Error(`malformed viewBox: "${vbMatch[1]}"`);
  }

  const start = svg.indexOf(`id="${GROUP_ID}"`);
  if (start < 0) throw new Error(`corridor group ${GROUP_ID} not found`);
  // Back up to the '<' of the tag that carries the id, so nesting balances.
  const tagStart = svg.lastIndexOf('<', start);
  const group = sliceElement(svg, tagStart, 'g');

  const segments = [...group.matchAll(/<path\b[^>]*?\sd="([^"]*)"/gs)]
    .map((m) => pathToPoints(m[1]))
    .filter((p) => p.length > 1);

  if (segments.length === 0) throw new Error('no corridor sub-paths parsed');

  // Join sub-paths head-to-tail; the authored gaps (~20-60 units) become straight
  // connectors, which read as road on a national-scale map.
  const points = segments.flat();

  const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) length += dist(points[i], points[i + 1]);

  return {
    source: sourceLabel,
    viewBox: { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] },
    segments: segments.length,
    points,
    length: Number(length.toFixed(1)),
  };
}

// `node extract-route.mjs` regenerates route.json in place.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let svg;
  try {
    svg = readFileSync(SVG, 'utf8');
  } catch (e) {
    console.error(`cannot read the corridor SVG at ${SVG}\n  ${e.message}`);
    process.exit(1);
  }

  const route = extractRoute(svg, {
    sourceLabel: `artifacts/bih-motorway-m15-glamoc-livno-segment.svg#${GROUP_ID}`,
  });

  writeFileSync(OUT, JSON.stringify(route, null, 2) + '\n');
  console.log(
    `route.json: ${route.points.length} points across ${route.segments} sub-paths, ` +
    `${route.length} SVG units, viewBox ${route.viewBox.width}x${route.viewBox.height}`
  );
}
