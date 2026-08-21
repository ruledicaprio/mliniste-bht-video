// The contract every piece's timeline has to satisfy, asserted identically for
// the intro and the outro.
//
// This is not itself a test file (no `.test.` in the name, so the runner does
// not pick it up) — each piece's own suite calls it with its timeline.
//
// The one thing deliberately NOT asserted here is where the footage block
// sits. The intro ends on footage and the outro opens on it, so the shared
// rule is only that the footage frames form ONE contiguous run somewhere in
// the clip.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FPS, ramp } from '../easing.mjs';

export function timelineContract(timeline, label) {
  const {
    DUR, FRAMES, PHASES, FOOTAGE_PHASES,
    frameToTime, phaseProgress, frameSpan, plateIndex, footagePhaseAt,
  } = timeline;

  /* ============================ clip shape ================================ */

  test(`${label}: clip shape is FPS x DUR frames`, () => {
    assert.equal(FRAMES, FPS * DUR);
    assert.ok(Number.isInteger(FRAMES));
  });

  test(`${label}: the first frame is t=0 and the LAST lands exactly on DUR`, () => {
    // The original regression: dividing by FPS tops out one frame short, which
    // leaves every closing animation permanently unfinished.
    assert.equal(frameToTime(0), 0);
    assert.equal(frameToTime(FRAMES - 1), DUR);
  });

  test(`${label}: frameToTime is monotonic and clamped`, () => {
    assert.equal(frameToTime(-5), 0);
    assert.equal(frameToTime(FRAMES + 100), DUR);
    let prev = -1;
    for (let f = 0; f < FRAMES; f++) {
      const t = frameToTime(f);
      assert.ok(t > prev, `frame ${f} did not advance`);
      prev = t;
    }
  });

  /* ============================ phase table =============================== */

  test(`${label}: the timeline starts at 0 and the last phase ends exactly on DUR`, () => {
    const all = Object.values(PHASES);
    assert.equal(Math.min(...all.map((p) => p.start)), 0);
    assert.equal(Math.max(...all.map((p) => p.end)), DUR);
  });

  test(`${label}: every phase runs forward and sits inside the clip`, () => {
    for (const [name, p] of Object.entries(PHASES)) {
      assert.ok(p.end > p.start, `${name} does not run forward`);
      assert.ok(p.start >= 0 && p.end <= DUR, `${name} falls outside 0..DUR`);
    }
  });

  test(`${label}: footage phases are contiguous and never overlap`, () => {
    // Graphic phases may overlap — that overlap is the dissolve. Footage
    // phases may not: each output frame must map to exactly one plate
    // directory.
    const spans = FOOTAGE_PHASES.map((n) => ({ n, ...frameSpan(n) }))
      .sort((a, b) => a.first - b.first);
    for (let i = 1; i < spans.length; i++) {
      assert.equal(
        spans[i].first, spans[i - 1].first + spans[i - 1].count,
        `gap or overlap between ${spans[i - 1].n} and ${spans[i].n}`
      );
    }
  });

  test(`${label}: the footage frames form one contiguous run`, () => {
    // Where that run sits is the piece's business — the intro ends on footage,
    // the outro opens on it — but it must not be split into islands, or a
    // graphic phase would have to draw in the middle of a dissolve.
    const footage = [];
    for (let f = 0; f < FRAMES; f++) if (footagePhaseAt(f) !== null) footage.push(f);
    assert.ok(footage.length > 0, 'no footage frames at all');
    assert.equal(
      footage.at(-1) - footage[0] + 1, footage.length,
      'the footage block has a hole in it'
    );
  });

  test(`${label}: frameSpan matches the phase duration in frames`, () => {
    // This is the assertion that catches a phase edge nudged in timing.mjs
    // without the plates being re-extracted: the extractor derives its frame
    // count from the same function.
    for (const name of FOOTAGE_PHASES) {
      const { start, end } = PHASES[name];
      assert.equal(frameSpan(name).count, Math.round(end * FPS) - Math.round(start * FPS), name);
    }
  });

  test(`${label}: every footage phase declares a source and an in-point`, () => {
    for (const name of FOOTAGE_PHASES) {
      assert.equal(typeof PHASES[name].src, 'string');
      assert.equal(typeof PHASES[name].in, 'number');
      assert.ok(PHASES[name].in >= 0);
    }
  });

  /* =========================== plate indexing ============================= */

  test(`${label}: a phase's first frame is plate 0 and its last is count-1`, () => {
    for (const name of FOOTAGE_PHASES) {
      const { first, count } = frameSpan(name);
      assert.equal(plateIndex(first, name), 0, `${name} first`);
      assert.equal(plateIndex(first + count - 1, name), count - 1, `${name} last`);
    }
  });

  test(`${label}: plateIndex refuses frames outside its phase`, () => {
    for (const name of FOOTAGE_PHASES) {
      const { first, count } = frameSpan(name);
      assert.equal(plateIndex(first - 1, name), null);
      assert.equal(plateIndex(first + count, name), null);
    }
  });

  test(`${label}: every output frame resolves to at most one footage phase`, () => {
    for (let f = 0; f < FRAMES; f++) {
      const hits = FOOTAGE_PHASES.filter((n) => plateIndex(f, n) !== null);
      assert.ok(hits.length <= 1, `frame ${f} claimed by ${hits.join(' and ')}`);
      assert.equal(footagePhaseAt(f), hits[0] ?? null, `frame ${f}`);
    }
  });

  test(`${label}: no plate index ever falls outside its extracted range`, () => {
    for (let f = 0; f < FRAMES; f++) {
      const name = footagePhaseAt(f);
      if (!name) continue;
      const i = plateIndex(f, name);
      assert.ok(i >= 0 && i < frameSpan(name).count, `frame ${f} -> plate ${i}`);
    }
  });

  /* =========================== phaseProgress ============================== */

  test(`${label}: phaseProgress spans 0..1 across a phase and clamps outside it`, () => {
    const name = Object.keys(PHASES)[0];
    const { start, end } = PHASES[name];
    assert.equal(phaseProgress(start, name), 0);
    assert.equal(phaseProgress(end, name), 1);
    assert.equal(phaseProgress(start - 1, name), 0);
    assert.equal(phaseProgress(end + 1, name), 1);
    // Phase edges are decimal seconds, so the midpoint is only 0.5 to within
    // float error — the boundary values above are what have to be exact.
    assert.ok(Math.abs(phaseProgress((start + end) / 2, name) - 0.5) < 1e-9);
  });

  /* ============================ closing fade ============================== */

  test(`${label}: the closing fade reaches full black on the last frame`, (t2) => {
    // The original regression: a fade keyed to DUR that the last frame never
    // reached, so the piece stopped just short of black and could not be cut
    // against anything.
    assert.equal(ramp(frameToTime(FRAMES - 1), DUR - 0.45, DUR), 1);
  });
}
