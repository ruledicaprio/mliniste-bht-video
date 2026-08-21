// The body edit — the film between the intro and the outro.
//
// This is the whole cut, declared. Unlike the intro and the outro there is no
// page to draw: the body is live action and stills, so it is assembled by
// ffmpeg alone (see build.mjs) rather than rendered a frame at a time through
// Chrome. What it does share with the bookends is the discipline: durations are
// authored in seconds here and converted to frames in exactly one place
// (timing.mjs), so the builder and the tests can never disagree about a length.
//
// Two shot kinds:
//   clip  — a range of a source clip: `in` is the seconds offset into it.
//   still — one photograph, held, with a slow Ken Burns move. `ken: 'in'` pushes
//           in, `'out'` pulls back. Alternating them keeps the stills from
//           reading as a slideshow.
//
// Every shot carries its `act`. That is not decoration: several filenames are
// ambiguous about where they belong (before-during-lets-get-this-done.jpg is
// Act 3 material despite the `before-` prefix), so the running order is stated
// rather than inferred, and the tests check it.
//
// Consecutive shots cross-dissolve by XFADE seconds, so the body's true length
// is sum(dur) - (n-1)*XFADE, not sum(dur). See timing.mjs.
//
// On picture quality: only before-snow-walking.mp4 and before-snow-walking-3.mp4
// are natively 1920x1080. The other three clips are 1024x576 and upscale 1.875x,
// which reads soft next to the CRF 16 bookends. The sharp material therefore
// carries the long held wides; the soft material gets short, tight cuts where
// the softness reads as motion. Do not "fix" this in the encoder.

/** Seconds of cross-dissolve between consecutive shots. Must be < the shortest dur. */
export const XFADE = 0.5;

/**
 * Source clip durations in seconds, as ffprobe reports them.
 *
 * Duplicated here so the tests can prove no shot runs off the end of its clip
 * without needing ffmpeg or the (untracked) footage in CI.
 */
export const CLIP_DUR = {
  'before-snow-walking.mp4': 36.672,
  'before-snow-walking-2.mp4': 37.536,
  'before-snow-walking-3.mp4': 37.205,
  'before-video-snow-mud.mp4': 24.846,
  'during-container-genset-replacement-lift-job.mp4': 34.770,
};

export const SHOTS = [
  /* --- ACT 1 — THE CHALLENGE ---------------------------------------------
     Getting there at all. Snow, mud, fog, and a generator at 15,000 hours. */
  { kind: 'clip',  src: 'before-snow-walking.mp4',                dur: 5.0, in: 12.0, act: 1 },
  { kind: 'still', src: 'before-mliniste-pass-motorway-snow.jpg', dur: 3.0, ken: 'in', act: 1 },
  { kind: 'clip',  src: 'before-video-snow-mud.mp4',              dur: 2.5, in: 2.0, act: 1 },
  { kind: 'still', src: 'before-during-bts-mliniste-snow-fog.png', dur: 3.0, ken: 'out', act: 1 },
  { kind: 'clip',  src: 'before-snow-walking-3.mp4',              dur: 4.5, in: 8.0, act: 1 },
  { kind: 'still', src: 'before-genset-with-15k-hours.jpg',       dur: 3.0, ken: 'in', act: 1 },

  /* --- ACT 2 — WHAT WAS NEEDED -------------------------------------------
     The requirements, laid out. Mostly portrait stills: the blurred-cover
     background in build.mjs is what makes them sit in a 16:9 frame. */
  { kind: 'still', src: 'what-was-needed-floating-72h-capacity.png',  dur: 3.0, ken: 'in', act: 2 },
  { kind: 'still', src: 'what-was-needed-power-and-batteries.jpeg',   dur: 2.5, ken: 'out', act: 2 },
  { kind: 'still', src: 'what-was-needed-secure-diesel-scenario.jpeg', dur: 2.5, ken: 'in', act: 2 },
  { kind: 'still', src: 'what-was-needed-cooling-security.jpeg',      dur: 2.5, ken: 'out', act: 2 },
  { kind: 'still', src: 'what-was-needed-distribution.jpeg',          dur: 2.5, ken: 'in', act: 2 },
  { kind: 'still', src: 'robust-flexible-scalable-requirements.jpeg', dur: 2.5, ken: 'out', act: 2 },

  /* --- ACT 3 — THE JOB ----------------------------------------------------
     The genset and container replacement. The spine of the film. */
  { kind: 'still', src: 'during-tree-cutters.jpg',                          dur: 2.5, ken: 'in', act: 3 },
  { kind: 'clip',  src: 'during-container-genset-replacement-lift-job.mp4', dur: 6.0, in: 6.0, act: 3 },
  { kind: 'still', src: 'during-single-genset-replacement-in-one-hit.jpg',  dur: 3.0, ken: 'out', act: 3 },
  { kind: 'clip',  src: 'during-container-genset-replacement-lift-job.mp4', dur: 5.0, in: 20.0, act: 3 },
  { kind: 'still', src: 'during-realisation.jpg',                           dur: 2.5, ken: 'in', act: 3 },
  { kind: 'still', src: 'during-tank-and-refill-4 times.jpg',               dur: 2.5, ken: 'out', act: 3 },
  { kind: 'still', src: 'before-during-lets-get-this-done.jpg',             dur: 2.5, ken: 'in', act: 3 },

  /* --- ACT 4 — THE RESULT -------------------------------------------------
     Hybrid power standing on the mountain. Ends wide and calm, so the outro
     can cut straight in on the finished compound. */
  { kind: 'still', src: 'what-was-needed-full-container-villa.jpeg',      dur: 3.0, ken: 'in', act: 4 },
  { kind: 'still', src: 'genset-PV-heaters-engaged-in-cogeneration.jpeg', dur: 3.0, ken: 'out', act: 4 },
  { kind: 'still', src: 'now-clean-source-our-SOL.jpg',                   dur: 3.0, ken: 'in', act: 4 },
  { kind: 'still', src: 'standing-firm-across-4-legs.jpeg',               dur: 2.5, ken: 'out', act: 4 },
  { kind: 'still', src: 'antenna-cuts-against-nature.jpg',                dur: 3.0, ken: 'in', act: 4 },
  { kind: 'still', src: 'perfect-tech-nature-contrast.jpg',               dur: 3.0, ken: 'out', act: 4 },
  { kind: 'still', src: 'sustainable-path.jpg',                           dur: 3.0, ken: 'in', act: 4 },
];
