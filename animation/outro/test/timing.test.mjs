import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineContract } from '../../shared/test/timeline-contract.mjs';
import * as timeline from '../timing.mjs';
import { PHASES as INTRO_PHASES } from '../../intro/timing.mjs';

const {
  FPS, DUR, FRAMES, frameToTime, ramp,
  PHASES, FOOTAGE_PHASES, frameSpan, footagePhaseAt,
} = timeline;

// Everything both pieces must satisfy — clip shape, phase-table sanity, plate
// indexing, the closing fade.
timelineContract(timeline, 'outro');

/* ========================= what is specific to the close ================== */

test('the outro is 420 frames of 30fps over 14 seconds', () => {
  assert.equal(FPS, 30);
  assert.equal(DUR, 14);
  assert.equal(FRAMES, 420);
});

test('the piece opens ON footage, at frame 0', () => {
  // The mirror of the opener. It cuts straight in from the body edit, so there
  // is no graphic head and no fade up — frame 0 is picture.
  assert.equal(footagePhaseAt(0), 'SUMMIT');
  assert.equal(Math.min(...FOOTAGE_PHASES.map((n) => frameSpan(n).first)), 0);
});

test('the first frame is NOT faded to black', () => {
  // drawGlass carries a closing dip only. An opening one would read as a
  // second beginning in the middle of the film.
  assert.equal(ramp(frameToTime(0), DUR - 0.5, DUR), 0);
});

test('the graphic tail owns every frame after the footage runs out', () => {
  const lastFootage = Math.max(...FOOTAGE_PHASES.map((n) => frameSpan(n).first + frameSpan(n).count));
  assert.ok(lastFootage < FRAMES, 'the outro must end on graphics, not footage');
  for (let f = lastFootage; f < FRAMES; f++) {
    assert.equal(footagePhaseAt(f), null, `frame ${f}`);
  }
});

test('the map is fully up before the footage runs out', () => {
  // MAP_IN in outro.html ends at 8.6 s, and the plates stop at 8.4 s. If the
  // footage ended first the frame would drop to bare backdrop for a beat, so
  // the pull-back has to be underway well before the last plate.
  const lastFootageFrame = Math.max(
    ...FOOTAGE_PHASES.map((n) => frameSpan(n).first + frameSpan(n).count)
  ) - 1;
  assert.ok(
    frameToTime(lastFootageFrame) > PHASES.PULLBACK.start,
    'the pull-back must start while there is still footage under it'
  );
});

test('the pull-back overlaps the footage and outlives it', () => {
  const footageEnd = PHASES.RIDGE.end;
  assert.ok(PHASES.PULLBACK.start < footageEnd, 'no dissolve — the map would cut in');
  assert.ok(PHASES.PULLBACK.end > footageEnd);
});

test('the brand beat is the last thing in the clip', () => {
  assert.equal(PHASES.BRAND.end, DUR);
  for (const [name, p] of Object.entries(PHASES)) {
    if (name === 'BRAND') continue;
    assert.ok(p.start <= PHASES.BRAND.start, `${name} starts after the brand beat`);
  }
});

/* ===================== against the opener's footage use =================== */

test('the outro does not re-use a range the opener already spends', () => {
  // Both pieces pull from the same two clips. Overlapping in-points would put
  // the same drone move at both ends of the film.
  const ranges = (phases) => Object.values(phases)
    .filter((p) => p.src)
    .map((p) => ({ src: p.src, from: p.in, to: p.in + (p.end - p.start) }));

  for (const a of ranges(PHASES)) {
    for (const b of ranges(INTRO_PHASES)) {
      if (a.src !== b.src) continue;
      assert.ok(
        a.to <= b.from || a.from >= b.to,
        `outro ${a.from}-${a.to}s overlaps intro ${b.from}-${b.to}s in ${a.src}`
      );
    }
  }
});
