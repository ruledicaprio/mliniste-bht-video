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

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = resolve(HERE, '../../artifacts/bih-motorway-m15-glamoc-livno-segment.svg');
const OUT = resolve(HERE, 'route.json');

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const TOKENS = new RegExp(`${NUM}|[MmLlZzHhVvCcSsQqTtAa]`, 'g');

function pathToPoints(d) {
  const toks = d.match(TOKENS) ?? [];
  const out = [];
  let x = 0, y = 0, cmd = 'M';
  for (let i = 0; i < toks.length;) {
    if (/^[A-Za-z]$/.test(toks[i])) { cmd = toks[i++]; continue; }
    if (i + 1 >= toks.length) break;
    const a = Number(toks[i]), b = Number(toks[i + 1]);
    i += 2;
    if (cmd === cmd.toLowerCase()) { x += a; y += b; } else { x = a; y = b; }
    out.push([Number(x.toFixed(2)), Number(y.toFixed(2))]);
    if (cmd === 'm') cmd = 'l';
    if (cmd === 'M') cmd = 'L';
  }
  return out;
}

const svg = readFileSync(SVG, 'utf8');

const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);

const start = svg.indexOf('id="g3922"');
if (start < 0) throw new Error('corridor group g3922 not found in ' + SVG);
const group = svg.slice(start, svg.indexOf('</g>', start));

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

const route = {
  source: 'artifacts/bih-motorway-m15-glamoc-livno-segment.svg#g3922',
  viewBox: { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] },
  segments: segments.length,
  points,
  length: Number(length.toFixed(1)),
};

writeFileSync(OUT, JSON.stringify(route, null, 2) + '\n');
console.log(
  `route.json: ${points.length} points across ${segments.length} sub-paths, ` +
  `${route.length} SVG units, viewBox ${viewBox[2]}x${viewBox[3]}`
);
