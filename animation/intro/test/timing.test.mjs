import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FPS, DUR, FRAMES, frameToTime, ramp, easeOut, easeInOut, window4, clamp01,
  hexToRgb, rgba,
} from '../timing.mjs';

test('clip shape is 300 frames of 30fps over 10 seconds', () => {
  assert.equal(FPS, 30);
  assert.equal(DUR, 10);
  assert.equal(FRAMES, 300);
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
