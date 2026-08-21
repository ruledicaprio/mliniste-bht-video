import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FPS, DUR, FRAMES, frameToTime, ramp, easeOut, easeInOut, window4, clamp01,
  hexToRgb, rgba,
  PHASES, FOOTAGE_PHASES, frameSpan, plateIndex, footagePhaseAt, phaseProgress,
} from '../timing.mjs';

test('clip shape is 840 frames of 30fps over 28 seconds', () => {
  assert.equal(FPS, 30);
  assert.equal(DUR, 28);
  assert.equal(FRAMES, 840);
});

test('the first frame is t=0', () => {
  assert.equal(frameToTime(0), 0);
});

test('the LAST frame lands exactly on DUR', () => {
  // The regression this suite exists for: dividing by FPS topped out at
  // 299/30 = 9.9667, so every keyframe ending at 10 never completed.
  assert.equal(frameToTime(FRAMES - 1), DUR);
});

test('the closing fade to black actually reaches black', () => {
  // drawGlass: ramp(t, 9.75, 10) is the closing dip. Before the fix this
  // peaked at 0.867 and the clip ended on a visible frame.
  const fade = ramp(frameToTime(FRAMES - 1), 9.75, 10);
  assert.equal(fade, 1);
});

test('the opening fade starts fully black', () => {
  assert.equal(1 - ramp(frameToTime(0), 0, 0.35), 1);
});

test('frameToTime is monotonic and clamped', () => {
  assert.equal(frameToTime(-5), 0);
  assert.equal(frameToTime(FRAMES + 100), DUR);
  for (let f = 1; f < FRAMES; f++) {
    assert.ok(frameToTime(f) > frameToTime(f - 1), `not increasing at frame ${f}`);
  }
});

test('clamp01 bounds its input', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(2), 1);
});

test('ramp is 0 before, 1 after, linear between', () => {
  assert.equal(ramp(0, 2, 4), 0);
  assert.equal(ramp(3, 2, 4), 0.5);
  assert.equal(ramp(9, 2, 4), 1);
});

test('easing curves hit their endpoints', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
});

test('window4 opens then closes', () => {
  assert.equal(window4(0, 1, 2, 3, 4), 0);   // before the open
  assert.equal(window4(2.5, 1, 2, 3, 4), 1); // fully open
  assert.equal(window4(5, 1, 2, 3, 4), 0);   // after the close
});

test('hexToRgb matches the brand orange bytes the coverage mask writes', () => {
  assert.deepEqual(hexToRgb('#f5821f'), [0xf5, 0x82, 0x1f]);
  assert.deepEqual(hexToRgb('#38e1ff'), [56, 225, 255]);
});

test('hexToRgb rejects malformed input', () => {
  assert.throws(() => hexToRgb('#fff'), /hex colour/);
  assert.throws(() => hexToRgb('orange'), /hex colour/);
});

test('rgba renders a css colour', () => {
  assert.equal(rgba('#f5821f', 0), 'rgba(245,130,31,0)');
  assert.equal(rgba('#38e1ff', 0.3), 'rgba(56,225,255,0.3)');
});

/* ============================== phase table =============================== */

test('the timeline starts at 0 and the last phase ends exactly on DUR', () => {
  const all = Object.values(PHASES);
  assert.equal(Math.min(...all.map((p) => p.start)), 0);
  assert.equal(Math.max(...all.map((p) => p.end)), DUR);
});

test('every phase runs forward and sits inside the clip', () => {
  for (const [name, p] of Object.entries(PHASES)) {
    assert.ok(p.end > p.start, `${name} does not run forward`);
    assert.ok(p.start >= 0 && p.end <= DUR, `${name} falls outside 0..DUR`);
  }
});

test('footage phases are contiguous and never overlap', () => {
  // Graphic phases may overlap — that overlap is the dissolve. Footage phases
  // may not: each output frame must map to exactly one plate directory.
  const spans = FOOTAGE_PHASES.map((n) => ({ n, ...frameSpan(n) }))
    .sort((a, b) => a.first - b.first);
  for (let i = 1; i < spans.length; i++) {
    assert.equal(
      spans[i].first, spans[i - 1].first + spans[i - 1].count,
      `gap or overlap between ${spans[i - 1].n} and ${spans[i].n}`
    );
  }
});

test('the footage block runs to the last frame of the clip', () => {
  const spans = FOOTAGE_PHASES.map((n) => frameSpan(n));
  assert.equal(Math.max(...spans.map((s) => s.first + s.count)), FRAMES);
});

test('frameSpan matches the phase duration in frames', () => {
  // This is the assertion that catches a phase edge nudged in timing.mjs
  // without `npm run plates` being re-run: the extractor derives its frame
  // count from the same function.
  for (const name of FOOTAGE_PHASES) {
    const { start, end } = PHASES[name];
    assert.equal(frameSpan(name).count, Math.round(end * FPS) - Math.round(start * FPS), name);
  }
});

test('every footage phase declares a source and an in-point', () => {
  for (const name of FOOTAGE_PHASES) {
    assert.equal(typeof PHASES[name].src, 'string');
    assert.equal(typeof PHASES[name].in, 'number');
    assert.ok(PHASES[name].in >= 0);
  }
});

/* ============================= plate indexing ============================= */

test('a phase’s first frame is plate 0 and its last is count-1', () => {
  for (const name of FOOTAGE_PHASES) {
    const { first, count } = frameSpan(name);
    assert.equal(plateIndex(first, name), 0, `${name} first`);
    assert.equal(plateIndex(first + count - 1, name), count - 1, `${name} last`);
  }
});

test('plateIndex refuses frames outside its phase', () => {
  for (const name of FOOTAGE_PHASES) {
    const { first, count } = frameSpan(name);
    assert.equal(plateIndex(first - 1, name), null);
    assert.equal(plateIndex(first + count, name), null);
  }
});

test('every output frame resolves to at most one footage phase', () => {
  for (let f = 0; f < FRAMES; f++) {
    const hits = FOOTAGE_PHASES.filter((n) => plateIndex(f, n) !== null);
    assert.ok(hits.length <= 1, `frame ${f} claimed by ${hits.join(' and ')}`);
    assert.equal(footagePhaseAt(f), hits[0] ?? null, `frame ${f}`);
  }
});

test('no plate index ever falls outside its extracted range', () => {
  for (let f = 0; f < FRAMES; f++) {
    const name = footagePhaseAt(f);
    if (!name) continue;
    const i = plateIndex(f, name);
    assert.ok(i >= 0 && i < frameSpan(name).count, `frame ${f} -> plate ${i}`);
  }
});

test('the graphic head owns every frame before the first footage phase', () => {
  const firstFootage = Math.min(...FOOTAGE_PHASES.map((n) => frameSpan(n).first));
  for (let f = 0; f < firstFootage; f++) assert.equal(footagePhaseAt(f), null);
});

/* ============================= phaseProgress ============================== */

test('phaseProgress spans 0..1 across a phase and clamps outside it', () => {
  const { start, end } = PHASES.ZOOM;
  assert.equal(phaseProgress(start, 'ZOOM'), 0);
  assert.equal(phaseProgress(end, 'ZOOM'), 1);
  assert.equal(phaseProgress(start - 1, 'ZOOM'), 0);
  assert.equal(phaseProgress(end + 1, 'ZOOM'), 1);
  // Phase edges are decimal seconds, so the midpoint is only 0.5 to within
  // float error — the boundary values above are what have to be exact.
  assert.ok(Math.abs(phaseProgress((start + end) / 2, 'ZOOM') - 0.5) < 1e-9);
});

test('the closing fade still reaches full black at the new duration', () => {
  // The original regression: a fade keyed to DUR that the last frame never
  // reached. It has to keep holding now that DUR is 28, not 10.
  assert.equal(ramp(frameToTime(FRAMES - 1), DUR - 0.45, DUR), 1);
});
