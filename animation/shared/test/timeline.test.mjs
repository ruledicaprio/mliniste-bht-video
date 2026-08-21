import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FPS } from '../easing.mjs';
import { makeTimeline } from '../timeline.mjs';

test('two timelines built from different tables do not share state', () => {
  // The phase logic used to read module-level constants. Turning it into a
  // factory is only safe if each result closes over its own table — otherwise
  // loading the outro would silently redefine the intro's frame arithmetic.
  const a = makeTimeline({ DUR: 10, PHASES: { A: { start: 0, end: 10, src: 'a.mp4', in: 0 } } });
  const b = makeTimeline({ DUR: 4,  PHASES: { B: { start: 0, end: 4,  src: 'b.mp4', in: 1 } } });

  assert.equal(a.FRAMES, 300);
  assert.equal(b.FRAMES, 120);
  assert.deepEqual(a.FOOTAGE_PHASES, ['A']);
  assert.deepEqual(b.FOOTAGE_PHASES, ['B']);
  assert.equal(a.frameSpan('A').count, 300);
  assert.equal(b.frameSpan('B').count, 120);
  assert.equal(a.frameToTime(a.FRAMES - 1), 10);
  assert.equal(b.frameToTime(b.FRAMES - 1), 4);
});

test('rounding happens once, in frameSpan, so adjacent phases cannot disagree', () => {
  // Edges that do not land on whole frames are the interesting case: 3.33 s is
  // 99.9 frames. Whatever frameSpan decides, the next phase must start there.
  const t = makeTimeline({
    DUR: 10,
    PHASES: {
      A: { start: 0,    end: 3.33, src: 'a.mp4', in: 0 },
      B: { start: 3.33, end: 6.67, src: 'b.mp4', in: 0 },
      C: { start: 6.67, end: 10,   src: 'c.mp4', in: 0 },
    },
  });
  const a = t.frameSpan('A'), b = t.frameSpan('B'), c = t.frameSpan('C');
  assert.equal(a.first + a.count, b.first);
  assert.equal(b.first + b.count, c.first);
  assert.equal(c.first + c.count, t.FRAMES);
});

test('footagePhaseAt is null where no phase declares a source', () => {
  const t = makeTimeline({
    DUR: 2,
    PHASES: {
      GRAPHIC: { start: 0, end: 1 },
      SHOT:    { start: 1, end: 2, src: 's.mp4', in: 0 },
    },
  });
  assert.equal(t.footagePhaseAt(0), null);
  assert.equal(t.footagePhaseAt(FPS - 1), null);
  assert.equal(t.footagePhaseAt(FPS), 'SHOT');
  assert.equal(t.footagePhaseAt(t.FRAMES - 1), 'SHOT');
});
