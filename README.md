# mliniste-bht-video

BH Telecom infrastructure video for the **Mlinište** site — the micro base station
on the M-15 Glamoč–Livno road at the Mlinište pass (44°15'55"N 16°51'06"E, 1155 m).

The repo holds two things: the source material for the film, and the code that
renders its opening title sequence.

## Layout

| Path | What it is |
| :--- | :--- |
| `animation/intro/` | The M-15 intro HUD renderer — HTML canvas → PNG frames → MP4. |
| `artifacts/` | Source assets the intro draws: the map SVG, the national coverage plate, the BHT logo, plus reference material. |
| `*.jpg` `*.mp4` (repo root) | Camera footage and stills. **Untracked** — see [Source material](#source-material). |
| `widevideo/` | Where the final edit is assembled. |

## The intro sequence

`animation/intro/` renders a 1920×1080, 30 fps, 28-second opener. The national
map fades up, the M-15 corridor traces itself from Glamoč to Livno, the reticle
locks onto Mlinište, and the BHT coverage raster blooms out from it. The camera
then pushes down through the map onto the corridor and dissolves into drone
footage of the real road, the ridge, and the site, closing on the BHT mark.

Live footage is part of the render, not something layered on afterwards: the
chosen ranges are pulled out of the source clips as frames (`npm run plates`)
and composited under the HUD one frame at a time. The output is a single
self-contained MP4.

It is **deterministic**. Every visual is a pure function of the frame index —
nothing reads the wall clock — so the headless render and the live preview
produce identical pixels, and a re-render is byte-reproducible.

### Prerequisites

- **Node.js ≥ 22.12** (required by `puppeteer-core`'s browser tooling)
- **Chrome or Edge**, installed locally. `puppeteer-core` does not download a
  browser; the renderer probes the usual Windows/macOS/Linux install paths.
  Override with `CHROME_PATH=/path/to/chrome`.
- **ffmpeg** on `PATH`, for extracting footage plates and for the final mux.
  Override with `FFMPEG_PATH=...` — needed on Windows if your ffmpeg is a
  scoop/choco `.cmd` shim.
- **The source clips**, on disk at the repo root. They are untracked (see
  [Source material](#source-material)), so a fresh clone can run `npm test` and
  `npm run preview`'s graphic act, but not a full render.

```bash
npm install
```

### Commands

| Command | Does |
| :--- | :--- |
| `npm run preview` | Static server + scrubbable preview in your browser. |
| `npm run plates` | Extracts the footage frames the intro composites over. Run once; re-run after changing a phase edge. |
| `npm run render` | Renders 840 PNGs to `animation/intro/frames/`, then muxes `mliniste-intro.mp4` (libx264, CRF 16). Refuses to start if the plates are missing or stale. |
| `npm run frames` | Frames only, no video. |
| `npm run route` | Regenerates `route.json` from the corridor SVG. |
| `npm test` | Unit tests. |

Frames come off the canvas via `toDataURL`, not `page.screenshot`, so the output
is exact canvas pixels regardless of how CSS scales the element for preview.

### How the pieces fit

- **`timing.mjs`** — frame count, fps, easing curves, `frameToTime()`, and the
  **phase table**: the named spans the clip is authored in, and the frame-range
  arithmetic that maps an output frame to an extracted footage plate. The single
  source of truth for the clip's shape; imported by the page, the extractor and
  the tests. Graphic phases may overlap — that overlap is the dissolve — but
  footage phases own exclusive, contiguous frame ranges.
- **`extract-plates.mjs`** — pulls each footage phase's frames out of its source
  clip with ffmpeg. The `fps=30` filter here is what resolves the sources'
  30000/1001 rate, so no drift math ever reaches the renderer. Output goes to
  `plates/` (~400 MB, gitignored, regenerable).
- **`server.mjs`** — static server rooted at the repo, because `file://` blocks
  the SVG and JSON fetches under CORS.
- **`intro.html`** — the animation. Exposes `window.INTRO.{fps, frames, ready, seek}`.
- **`render.mjs`** — drives the page one frame at a time through headless Chrome,
  then calls ffmpeg.
- **`extract-route.mjs`** + **`svg-path.mjs`** — turn the hand-drawn `g3922`
  corridor markup in the map SVG into the `route.json` polyline. Run only when the
  SVG changes; the output is committed.

Tests cover the pure logic — the SVG path parser, the keyframe timing, the phase
table and plate indexing, and the server — so they need neither Chrome, ffmpeg,
nor the footage, and run in CI.

### Retuning

Timings are meant to be turned. Phase edges live in `PHASES` in `timing.mjs`;
look-and-feel constants (`SITE_T`, `ZOOM_MAX`, `MAP_OUT`, `COVERAGE_OUT`,
`PLATE_FADE`, `CUT_DIP`, scanline weights) sit together near the top of
`intro.html`. Move a **footage** phase edge and you must re-run `npm run plates`
— the test suite fails loudly if the plate count no longer matches.

## Source material

The camera footage and stills at the repo root are **not tracked**. They are
roughly 1 GB of material that the intro never reads (it only touches `artifacts/`),
and they are backed up separately.

The rendered intro (`animation/intro/mliniste-intro.mp4`) is untracked for the
same reason: once live footage entered the render it became ~90 MB that changes
on every pass. Regenerate it with `npm run plates && npm run render`.

The stills and clips *were* committed at one point, so they still exist in git history — the
`.gitignore` rules only ever applied to untracked files, and the paths had to be
removed from the index with `git rm --cached` before those rules did anything.
Shrinking the history itself is a separate, irreversible rewrite.
