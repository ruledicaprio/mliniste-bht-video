// The phase-table machinery, as a factory.
//
// A piece (intro, outro) declares its own duration and named phase spans; this
// turns that declaration into the frame arithmetic that the page, the plate
// extractor, the renderer and the tests all share.
//
// Graphic phases MAY overlap — that overlap IS the dissolve. Footage phases
// must not: each owns a contiguous, exclusive block of output frames, because
// those frames index 1:1 into an extracted plate directory.
//
// Retuning: move an edge in a piece's PHASES, then re-run that piece's plate
// extraction. The test suite fails loudly if a footage edge moves without the
// plate count following.

import { FPS, ramp } from './easing.mjs';

/**
 * Builds a timeline from a duration and a phase table.
 *
 * Each returned helper closes over this table, so two pieces built from
 * different declarations share code but never share state.
 */
export function makeTimeline({ DUR, PHASES }) {
  const FRAMES = FPS * DUR;

  /**
   * Seconds for a frame index.
   *
   * Frame indices run 0..FRAMES-1, and the last one must land exactly on DUR:
   * keyframes are authored against the wall-clock duration, so dividing by FPS
   * would top out one frame short and leave every closing animation
   * permanently unfinished — the final fade would stop just before black.
   */
  const frameToTime = (frame) =>
    (Math.max(0, Math.min(FRAMES - 1, frame)) / (FRAMES - 1)) * DUR;

  /** Phases backed by extracted footage, in declaration order. */
  const FOOTAGE_PHASES = Object.keys(PHASES).filter((k) => PHASES[k].src);

  /** Progress 0..1 of t through a named phase, clamped. */
  const phaseProgress = (t, name) => {
    const p = PHASES[name];
    return ramp(t, p.start, p.end);
  };

  /**
   * The half-open output-frame range [first, first + count) a phase owns.
   *
   * Rounding happens here and nowhere else: the extractor, the renderer and
   * the tests all derive their frame counts from this one function, so a phase
   * edge can never mean 180 frames in one place and 181 in another.
   */
  function frameSpan(name) {
    const p = PHASES[name];
    const first = Math.round(p.start * FPS);
    return { first, count: Math.round(p.end * FPS) - first };
  }

  /**
   * Which extracted plate an output frame wants, or null if the frame is not
   * in this phase. Frame `first` is plate 0 by construction.
   */
  function plateIndex(frame, name) {
    const { first, count } = frameSpan(name);
    const i = frame - first;
    return i >= 0 && i < count ? i : null;
  }

  /** The footage phase covering an output frame, or null where none does. */
  function footagePhaseAt(frame) {
    return FOOTAGE_PHASES.find((n) => plateIndex(frame, n) !== null) ?? null;
  }

  return {
    DUR, FRAMES, PHASES, FOOTAGE_PHASES,
    frameToTime, phaseProgress, frameSpan, plateIndex, footagePhaseAt,
  };
}
