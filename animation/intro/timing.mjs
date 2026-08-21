// Timing constants and easing helpers for the M-15 intro.
//
// Shared between intro.html (the animation itself) and the test suite, so the
// keyframe math can be asserted without a browser. Everything here is a pure
// function of the frame index — nothing reads the wall clock, which is what
// makes the render deterministic.

/* --- the one source of truth for the clip's shape ------------------------- */
export const FPS = 30;
export const DUR = 28;                  // seconds
export const FRAMES = FPS * DUR;        // 840
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

/* ============================== phase table ===============================
   The clip is one continuous 28 s timeline, but it is authored in named
   phases so new material can be added without renumbering the hand-tuned
   keyframes of the ones already finished.

   Act 1 (MAP) keeps the absolute second values it has always had — every
   `ramp(t, 6.1, 7.9)` inside intro.html still fires at exactly the same
   wall-clock moment it did in the original 10 s cut. Nothing before t = 9
   was rebased.

   Graphic phases MAY overlap (that overlap IS the dissolve). Footage phases
   must not: each one owns a contiguous, exclusive block of output frames,
   because those frames index 1:1 into an extracted plate directory.

   Retuning: move an edge here, then re-run `npm run plates`. The test suite
   fails loudly if a footage edge moves without the plate count following.   */

/** In-points were chosen off contact sheets of the two source clips; see the
    per-phase notes. Both sources are 1920x1080 HEVC at 30000/1001 fps — the
    extractor resamples to a flat 30 so no drift math reaches the renderer. */
const MOTORWAY_SRC = '../../vid-intro-motorway-some-nature-and-from-34-sec-almost-to-end.mp4';
const RISING_SRC   = '../../vid-from-4-sec-rising-to-nature-scene.mp4';

export const PHASES = {
  /* The original act, untouched: grid, map, route trace, scan sweep, site
     lock, coverage bloom. Its own layer fades run out to ~9.4. */
  MAP:      { start: 0,    end: 9.4 },

  /* Camera pushes in on the map toward the reticle. Overlaps MAP's tail on
     one side and MOTORWAY's head on the other, so there is never a cut. */
  ZOOM:     { start: 9.0,  end: 13.6 },

  /* The M-15 itself, from above: the hairpin the traced corridor was standing
     in for. Continuous drone move, road held in frame throughout. */
  MOTORWAY: { start: 13.2, end: 19.2, src: MOTORWAY_SRC, in: 1.0 },

  /* Same clip, 41 s later in its own move: the ridge opens up and the mast
     appears on it. This is the reveal that the graphics were pointing at. */
  APPROACH: { start: 19.2, end: 23.4, src: MOTORWAY_SRC, in: 42.0 },

  /* The other clip's payoff: the antennas crowned against the open panorama. */
  SITE:     { start: 23.4, end: 28.0, src: RISING_SRC,   in: 34.0 },

  /* Not its own picture — a scrim, the logo and the tagline laid over SITE's
     tail, then the final fade. Keeping it as an overlay means the piece ends
     on the mountain rather than on a black card. */
  OUTRO:    { start: 25.6, end: 28.0 },
};

/** Phases backed by extracted footage, in timeline order. */
export const FOOTAGE_PHASES = Object.keys(PHASES).filter((k) => PHASES[k].src);

/** Progress 0..1 of t through a named phase, clamped. */
export const phaseProgress = (t, name) => {
  const p = PHASES[name];
  return ramp(t, p.start, p.end);
};

/**
 * The half-open output-frame range [first, first + count) a phase owns.
 *
 * Rounding happens here and nowhere else: the extractor, the renderer and the
 * tests all derive their frame counts from this one function, so a phase edge
 * can never mean 180 frames in one place and 181 in another.
 */
export function frameSpan(name) {
  const p = PHASES[name];
  const first = Math.round(p.start * FPS);
  return { first, count: Math.round(p.end * FPS) - first };
}

/**
 * Which extracted plate an output frame wants, or null if the frame is not in
 * this phase. Frame `first` is plate 0 by construction.
 */
export function plateIndex(frame, name) {
  const { first, count } = frameSpan(name);
  const i = frame - first;
  return i >= 0 && i < count ? i : null;
}

/** The footage phase covering an output frame, or null for the graphic-only head. */
export function footagePhaseAt(frame) {
  return FOOTAGE_PHASES.find((n) => plateIndex(frame, n) !== null) ?? null;
}
