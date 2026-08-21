import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineContract } from '../../shared/test/timeline-contract.mjs';
import * as timeline from '../timing.mjs';

const {
  FPS, DUR, FRAMES, frameToTime, ramp,
  PHASES, FOOTAGE_PHASES, frameSpan,
} = timeline;

// Everything both pieces must satisfy — clip shape, phase-table sanity, plate
// indexing, the closing fade.
timelineContract(timeline, 'intro');

/* ========================= what is specific to the opener ================= */

test('the opener is 840 frames of 30fps over 28 seconds', () => {
  assert.equal(FPS, 30);
  assert.equal(DUR, 28);
  assert.equal(FRAMES, 840);
});

test('the opening fade starts fully black', () => {
  // The opener fades up from black; the outro deliberately does not.
  assert.equal(1 - ramp(frameToTime(0), 0, 0.35), 1);
});

test('the footage block runs to the last frame of the clip', () => {
  // The opener ENDS on footage — it dissolves out of the map and stays on the
  // mountain. (The outro is the mirror: it opens on footage instead.)
  const spans = FOOTAGE_PHASES.map((n) => frameSpan(n));
  assert.equal(Math.max(...spans.map((s) => s.first + s.count)), FRAMES);
});

test('the graphic head owns every frame before the first footage phase', () => {
  const firstFootage = Math.min(...FOOTAGE_PHASES.map((n) => frameSpan(n).first));
  assert.ok(firstFootage > 0, 'the opener must start on graphics, not footage');
  for (let f = 0; f < firstFootage; f++) {
    assert.equal(timeline.footagePhaseAt(f), null);
  }
});

test('act one still fires at the seconds it always did', () => {
  // The whole extension from 10 s to 28 s rests on act 1 being left alone.
  // These are the edges its hand-tuned keyframes are authored against.
  assert.equal(PHASES.MAP.start, 0);
  assert.equal(PHASES.MAP.end, 9.4);
  assert.equal(PHASES.ZOOM.start, 9.0);
});

test('the tail phase survives for the footage tag to key against', () => {
  // drawFootageTag fades out against PHASES.TAIL.start. The logo and tagline
  // that used to draw here are gone — the span is not.
  assert.ok(PHASES.TAIL, 'the tail span was deleted; the footage tag keys to it');
  assert.equal(PHASES.TAIL.end, DUR);
});

test('the opener carries no brand mark', () => {
  // Cut deliberately: the film's one logo-and-tagline beat belongs to the
  // outro. A phase named for it here would be the first sign of it creeping
  // back in.
  assert.equal(PHASES.OUTRO, undefined);
});
