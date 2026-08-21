import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToPoints } from '../svg-path.mjs';
import { extractRoute, sliceElement } from '../extract-route.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = resolve(HERE, '../../../artifacts/bih-motorway-m15-glamoc-livno-segment.svg');

test('absolute moveto + lineto', () => {
  assert.deepEqual(pathToPoints('M 10 20 L 30 40'), [[10, 20], [30, 40]]);
});

test('relative moveto treats following pairs as implicit linetos', () => {
  // This is exactly the shape the corridor SVG uses.
  assert.deepEqual(pathToPoints('m 10,10 5,5 5,5'), [[10, 10], [15, 15], [20, 20]]);
});

test('absolute moveto treats following pairs as implicit absolute linetos', () => {
  assert.deepEqual(pathToPoints('M 10,10 15,15 20,20'), [[10, 10], [15, 15], [20, 20]]);
});

test('H and V consume one parameter each', () => {
  // The old parser read two numbers per step and desynced the whole path here.
  assert.deepEqual(pathToPoints('M 0 0 H 10 V 20 H 30'), [[0, 0], [10, 0], [10, 20], [30, 20]]);
});

test('relative h and v are offsets from the current point', () => {
  assert.deepEqual(pathToPoints('m 5 5 h 10 v -5'), [[5, 5], [15, 5], [15, 0]]);
});

test('Z returns to the subpath start', () => {
  assert.deepEqual(pathToPoints('M 0 0 L 10 0 L 10 10 Z'), [[0, 0], [10, 0], [10, 10], [0, 0]]);
});

test('cubic curves are flattened, not treated as vertices', () => {
  const pts = pathToPoints('M 0 0 C 0 10 10 10 10 0');
  // Control points (0,10) and (10,10) must not appear as route vertices.
  assert.ok(!pts.some(([x, y]) => x === 0 && y === 10), 'control point leaked into output');
  assert.ok(pts.length > 3, 'curve was not flattened');
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts.at(-1), [10, 0]);
  // A symmetric cubic peaks at half its control height.
  const maxY = Math.max(...pts.map((p) => p[1]));
  assert.ok(Math.abs(maxY - 7.5) < 0.1, `expected peak ~7.5, got ${maxY}`);
});

test('quadratic curves are flattened', () => {
  const pts = pathToPoints('M 0 0 Q 5 10 10 0');
  assert.deepEqual(pts.at(-1), [10, 0]);
  const maxY = Math.max(...pts.map((p) => p[1]));
  assert.ok(Math.abs(maxY - 5) < 0.1, `expected peak ~5, got ${maxY}`);
});

test('arcs are rejected rather than silently mis-parsed', () => {
  assert.throws(() => pathToPoints('M 0 0 A 5 5 0 0 1 10 10'), /elliptical arc/);
});

test('truncated path data throws', () => {
  assert.throws(() => pathToPoints('M 0 0 L 10'), /truncated/);
});

test('path data starting with a number throws', () => {
  assert.throws(() => pathToPoints('10 20 30 40'), /expected a command/);
});

test('sliceElement balances nested groups', () => {
  const svg = '<g id="a"><g id="inner"><path/></g><path id="keep"/></g><g id="after"/>';
  const slice = sliceElement(svg, 0, 'g');
  assert.ok(slice.includes('id="keep"'), 'truncated at the first </g>');
  assert.ok(!slice.includes('id="after"'), 'ran past the closing tag');
});

test('sliceElement throws on an unterminated element', () => {
  assert.throws(() => sliceElement('<g id="a"><path/>', 0, 'g'), /unterminated/);
});

test('extractRoute reproduces the committed route.json', () => {
  const committed = JSON.parse(readFileSync(resolve(HERE, '../route.json'), 'utf8'));
  const built = extractRoute(readFileSync(SVG, 'utf8'), { sourceLabel: committed.source });
  assert.deepEqual(built, committed);
});

test('extractRoute rejects an SVG with no viewBox', () => {
  assert.throws(() => extractRoute('<svg><g id="g3922"><path d="M 0 0"/></g></svg>'), /viewBox/);
});

test('extractRoute rejects an SVG without the corridor group', () => {
  assert.throws(
    () => extractRoute('<svg viewBox="0 0 10 10"><g id="other"/></svg>'),
    /g3922 not found/
  );
});
