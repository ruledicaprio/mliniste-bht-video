// Frame arithmetic for the body edit.
//
// The bookends centralize their rounding in shared/timeline.mjs's frameSpan();
// the body has no phase table, but the same rule applies for the same reason:
// seconds become frames in exactly ONE function, so build.mjs, assemble.mjs and
// the tests can never disagree about how long the body is.

import { FPS } from '../shared/easing.mjs';
import { SHOTS, XFADE } from './shots.mjs';

/** The single rounding point. Seconds -> whole frames. */
export const frames = (seconds) => Math.round(seconds * FPS);

/** Cross-dissolve length in frames. */
export const FADE_FRAMES = frames(XFADE);

/**
 * Per-shot frame counts and the xfade offset each one starts at.
 *
 * xfade lays input i+1 over input i starting at `offset`, so each dissolve eats
 * FADE_FRAMES of the running total: offset(i) = sum(count[0..i]) - (i+1)*FADE.
 */
export const CUTS = SHOTS.map((shot, i) => ({ ...shot, index: i, count: frames(shot.dur) }));

let running = 0;
for (const cut of CUTS) {
  running += cut.count;
  // Offset of the dissolve INTO the next shot, i.e. where shot i+1 begins.
  cut.offset = running - (cut.index + 1) * FADE_FRAMES;
}

/** Total body length in frames, after every dissolve has been consumed. */
export const FRAMES = CUTS.reduce((n, c) => n + c.count, 0) - (CUTS.length - 1) * FADE_FRAMES;

/** Total body length in seconds. */
export const DUR = FRAMES / FPS;

export { FPS, SHOTS, XFADE };
