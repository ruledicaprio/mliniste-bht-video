// The intro's shape: how long it runs, and the named phases it is authored in.
//
// The easing curves and the phase-table arithmetic live in ../shared/ — this
// file is only the declaration, plus a re-export so the page, the extractor
// and the tests have one import to reach for.

import { makeTimeline } from '../shared/timeline.mjs';

export * from '../shared/easing.mjs';

/* --- the one source of truth for the clip's shape ------------------------- */
export const DUR = 28;                  // seconds

/** In-points were chosen off contact sheets of the two source clips; see the
    per-phase notes. Both sources are 1920x1080 HEVC at 30000/1001 fps — the
    extractor resamples to a flat 30 so no drift math reaches the renderer. */
const MOTORWAY_SRC = '../../vid-intro-motorway-some-nature-and-from-34-sec-almost-to-end.mp4';
const RISING_SRC   = '../../vid-from-4-sec-rising-to-nature-scene.mp4';

/* ============================== phase table ===============================
   Act 1 (MAP) keeps the absolute second values it has always had — every
   `ramp(t, 6.1, 7.9)` inside intro.html still fires at exactly the same
   wall-clock moment it did in the original 10 s cut. Nothing before t = 9
   was rebased.                                                              */
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

  /* The opener's tail. It carries no picture of its own — the piece simply
     ends on the mountain and fades. It used to hold a logo and tagline; those
     were cut once the film got a real outro, so the brand mark lands once, at
     the end of the film, instead of twice. The span stays because the footage
     tag keys its fade-out to it. */
  TAIL:     { start: 25.6, end: 28.0 },
};

export const {
  FRAMES, FOOTAGE_PHASES,
  frameToTime, phaseProgress, frameSpan, plateIndex, footagePhaseAt,
} = makeTimeline({ DUR, PHASES });
