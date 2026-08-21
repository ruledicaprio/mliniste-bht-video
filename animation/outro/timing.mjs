// The outro's shape: how long it runs, and the named phases it is authored in.
//
// The easing curves and the phase-table arithmetic live in ../shared/ — this
// file is only the declaration, plus a re-export so the page, the extractor
// and the tests have one import to reach for.

import { makeTimeline } from '../shared/timeline.mjs';

export * from '../shared/easing.mjs';

/* --- the one source of truth for the clip's shape ------------------------- */
export const DUR = 14;                  // seconds

/** In-points chosen off contact sheets, deliberately clear of the ranges the
    intro already spends (motorway 1.0 s and 42.0 s, rising 34.0 s). Both
    sources are 1920x1080 HEVC at 30000/1001 fps — the extractor resamples to a
    flat 30 so no drift math reaches the renderer. */
const MOTORWAY_SRC = '../../vid-intro-motorway-some-nature-and-from-34-sec-almost-to-end.mp4';
const RISING_SRC   = '../../vid-from-4-sec-rising-to-nature-scene.mp4';

/* ============================== phase table ===============================
   The intro run backwards. It opens on the finished site with no graphics at
   all, then the map rises out of the footage at full push-in and pulls back to
   national scale, the coverage floods it, and the brand mark lands.

   The footage block sits at the HEAD here, not the tail — the piece cuts
   straight in from the body edit and ends on the graphic, which is the mirror
   of what the opener does.                                                   */
export const PHASES = {
  /* Top-down descent onto the compound: mast, container, PV, access track.
     What the whole rebuild was for, shown plainly and without annotation. */
  SUMMIT:   { start: 0,    end: 4.2,  src: MOTORWAY_SRC, in: 66.0 },

  /* The sector antennas close, with the valley and the ridgelines wide behind
     them. The horizon only appears in this shot — which is exactly where the
     national map needs to arrive. */
  RIDGE:    { start: 4.2,  end: 8.4,  src: RISING_SRC,   in: 40.5 },

  /* The push-in reversed: the map re-forms blurred at full zoom over the
     footage, then pulls back to national scale as the blur clears. Overlaps
     the footage tail, so the handover is a dissolve rather than a cut. */
  PULLBACK: { start: 7.0,  end: 11.4 },

  /* The payoff the film argues for: coverage floods out from the site until
     all of BiH is lit. */
  COVERAGE: { start: 9.6,  end: 13.0 },

  /* Logo, tagline, fade. This is the film's one brand hit — the opener's was
     cut so this one lands alone. */
  BRAND:    { start: 11.6, end: 14.0 },
};

export const {
  FRAMES, FOOTAGE_PHASES,
  frameToTime, phaseProgress, frameSpan, plateIndex, footagePhaseAt,
} = makeTimeline({ DUR, PHASES });
