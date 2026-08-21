import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ramp, easeOut, easeInOut, window4, clamp01, hexToRgb, rgba } from '../easing.mjs';

// The curve and colour helpers every piece draws on. Lifted out of the intro's
// suite when they moved to ../easing.mjs — the bodies are unchanged.

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
