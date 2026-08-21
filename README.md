# mliniste-bht-video

BH Telecom infrastructure video for the **Mlinište** site — the micro base station
on the M-15 Glamoč–Livno road at the Mlinište pass (44°15'55"N 16°51'06"E, 1155 m).

The repo holds two things: the source material for the film, and the code that
renders its title sequences.

## Layout

| Path | What it is |
| :--- | :--- |
| `animation/intro/` | The 28 s opener — map, corridor, coverage, push-in, drone footage. |
| `animation/outro/` | The 14 s close — the opener run backwards, ending on the brand mark. |
| `animation/shared/` | What both pieces are built from: easing, the phase-table factory, the map/coverage/route drawing, the plate extractor, the renderer, the static server. |
| `artifacts/` | Source assets the pieces draw: the map SVG, the national coverage plate, the BHT logo, plus reference material. |
| `*.jpg` `*.mp4` (repo root) | Camera footage and stills. **Untracked** — see [Source material](#source-material). |
| `widevideo/` | Where the final edit is assembled: intro, body, outro. |

## The two pieces

Both render 1920×1080 at 30 fps, and both are **deterministic**. Every visual is a
pure function of the frame index — nothing reads the wall clock — so the headless
render and the live preview produce identical pixels, and a re-render is
byte-reproducible.

**The intro (28 s).** The national map fades up, the M-15 corridor traces itself
from Glamoč to Livno, the reticle locks onto Mlinište, and the BHT coverage raster
blooms out from it. The camera then pushes down through the map onto the corridor
and dissolves into drone footage of the real road, the ridge and the site, ending
on the mountain. It carries no brand mark — that belongs to the outro.

**The outro (14 s).** The same move in reverse. It cuts straight in from the body
edit on the finished compound — mast, container, PV — then the sector antennas
against the open valley. The map rises out of that shot at full push-in and pulls
back to national scale, the coverage floods it, and the logo and tagline land. One
brand hit, at the end, alone.

Live footage is part of the render, not something layered on afterwards: the chosen
ranges are pulled out of the source clips as frames (`npm run plates:*`) and
composited under the graphics one frame at a time. Each piece is a single
self-contained MP4.

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
  preview each piece's graphic phases, but not a full render.

```bash
npm install
```

### Commands

| Command | Does |
| :--- | :--- |
| `npm run preview:intro` / `preview:outro` | Static server + scrubbable preview in your browser. |
| `npm run plates:intro` / `plates:outro` | Extracts the footage frames that piece composites over. Run once; re-run after moving a footage phase edge. |
| `npm run render:intro` / `render:outro` | Renders the PNGs, then muxes the MP4 (libx264, CRF 16). Refuses to start if the plates are missing or stale. |
| `npm run frames:intro` / `frames:outro` | Frames only, no video. |
| `npm run route` | Regenerates `shared/route.json` from the corridor SVG. |
| `npm test` | Unit tests. |

Frames come off the canvas via `toDataURL`, not `page.screenshot`, so the output is
exact canvas pixels regardless of how CSS scales the element for preview.

### How the pieces fit

Each piece owns only its own **phase table** and its own **keyframes**. Everything
they draw the same way is shared.

- **`<piece>/timing.mjs`** — that piece's `DUR` and `PHASES`: the named spans it is
  authored in. Graphic phases may overlap — that overlap is the dissolve — but
  footage phases own exclusive, contiguous frame ranges.
- **`shared/timeline.mjs`** — turns a phase table into frame arithmetic
  (`frameSpan`, `plateIndex`, `footagePhaseAt`). **Rounding happens in `frameSpan`
  and nowhere else**, so the extractor, the renderer and the tests can never
  disagree about a frame count.
- **`shared/scene.mjs`** — the map, the corridor, the coverage raster, the zoom
  transform and the glass, as *primitives that take no time value*. Each page maps
  its own keyframes onto them, which is how the intro pushes in and the outro pulls
  back out using the same code.
- **`shared/plates.mjs`** — pulls each footage phase's frames out of its source clip
  with ffmpeg. The `fps=30` filter here is what resolves the sources' 30000/1001
  rate, so no drift math ever reaches the renderer. Output goes to
  `<piece>/plates/` (gitignored, regenerable).
- **`shared/render.mjs`** — drives a page one frame at a time through headless
  Chrome, then calls ffmpeg.
- **`shared/server.mjs`** — static server rooted at the repo, because `file://`
  blocks the SVG and JSON fetches under CORS.
- **`shared/extract-route.mjs`** + **`svg-path.mjs`** — turn the hand-drawn `g3922`
  corridor markup in the map SVG into the `route.json` polyline. Run only when the
  SVG changes; the output is committed.

Tests cover the pure logic — the SVG path parser, the easing curves, both phase
tables and their plate indexing, and the server — so they need neither Chrome,
ffmpeg, nor the footage, and run in CI. The shared contract in
`shared/test/timeline-contract.mjs` is asserted against both pieces.

### Retuning

Timings are meant to be turned. Phase edges live in each piece's `PHASES`;
look-and-feel constants sit together near the top of `intro.html` and `outro.html`
(`ZOOM_MAX`, `MAP_OUT` / `MAP_IN`, `COVERAGE_*`, `PLATE_FADE` / `PLATE_OUT`,
`CUT_DIP`, scanline weights, the brand-beat ramps). Registration constants both
pieces share — `SITE_T`, `COVERAGE_BOX`, `MAP` — are in `shared/scene.mjs`.

Move a **footage** phase edge and you must re-run that piece's `plates` script —
the test suite fails loudly if the plate count no longer matches.

## Source material

The camera footage and stills at the repo root are **not tracked**. They are
roughly 1 GB of material that the renderers never read wholesale (they only touch
`artifacts/` plus the extracted plate ranges), and they are backed up separately.

The rendered MP4s (`animation/*/mliniste-*.mp4`) are untracked for the same reason:
once live footage entered the render they became tens of megabytes that change on
every pass. Regenerate with `npm run plates:<piece> && npm run render:<piece>`.

The stills and clips *were* committed at one point, so they still exist in git
history — the `.gitignore` rules only ever applied to untracked files, and the paths
had to be removed from the index with `git rm --cached` before those rules did
anything. Shrinking the history itself is a separate, irreversible rewrite.
