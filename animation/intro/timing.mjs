// Timing constants and easing helpers for the M-15 intro.
//
// Shared between intro.html (the animation itself) and the test suite, so the
// keyframe math can be asserted without a browser. Everything here is a pure
// function of the frame index — nothing reads the wall clock, which is what
// makes the render deterministic.

/* --- the one source of truth for the clip's shape ------------------------- */
export const FPS = 30;
export const DUR = 10;                  // seconds
export const FRAMES = FPS * DUR;        // 300
export const W = 1920, H = 1080;

/**
 * Seconds for a frame index.
 *
 * Frame indices run 0..FRAMES-1, and the last one must land exactly on DUR:
 * keyframes are authored against the wall-clock duration (`ramp(t, 9.75, 10)`),
 * so dividing by FPS would top out at 299/30 = 9.9667 and leave every
 * closing animation permanently unfinished — the final fade would reach 87%
 * black and stop there.
 */
export const frameToTime = (frame) =>
  (Math.max(0, Math.min(FRAMES - 1, frame)) / (FRAMES - 1)) * DUR;

/* =============================== easing =================================== */
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalized progress of t through [a,b], clamped to 0..1. */
export const ramp = (t, a, b) => clamp01((t - a) / (b - a));
export const easeOut = (p) => 1 - Math.pow(1 - p, 3);
export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** Ramps up over [a,b] and back down over [c,d] — a windowed opacity. */
export const window4 = (t, a, b, c, d) =>
  Math.min(easeOut(ramp(t, a, b)), 1 - easeInOut(ramp(t, c, d)));
export const lerp = (a, b, p) => a + (b - a) * p;

/* --- colour --------------------------------------------------------------- */
/** '#f5821f' -> [245, 130, 31]. Lets one hex constant drive rgba() and raw pixel writes. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** '#f5821f', 0.3 -> 'rgba(245,130,31,0.3)'. */
export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
