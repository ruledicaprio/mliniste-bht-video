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

`animation/intro/` renders a 1920×1080, 30 fps, 10-second HUD animation: the
national map fades up, the M-15 corridor traces itself from Glamoč to Livno, the
reticle locks onto Mlinište, and the BHT coverage raster blooms out from it.

It is **deterministic**. Every visual is a pure function of the frame index —
nothing reads the wall clock — so the headless render and the live preview
produce identical pixels, and a re-render is byte-reproducible.

### Prerequisites

- **Node.js ≥ 22.12** (required by `puppeteer-core`'s browser tooling)
- **Chrome or Edge**, installed locally. `puppeteer-core` does not download a
  browser; the renderer probes the usual Windows/macOS/Linux install paths.
  Override with `CHROME_PATH=/path/to/chrome`.
- **ffmpeg** on `PATH`, for the final mux. Override with `FFMPEG_PATH=...` —
  needed on Windows if your ffmpeg is a scoop/choco `.cmd` shim.

```bash
npm install
```

### Commands

| Command | Does |
| :--- | :--- |
| `npm run preview` | Static server + scrubbable preview in your browser. |
| `npm run render` | Renders 300 PNGs to `animation/intro/frames/`, then muxes `mliniste-intro.mp4` (libx264, CRF 16). |
| `npm run frames` | Frames only, no video. |
| `npm run route` | Regenerates `route.json` from the corridor SVG. |
| `npm test` | Unit tests. |

Frames come off the canvas via `toDataURL`, not `page.screenshot`, so the output
is exact canvas pixels regardless of how CSS scales the element for preview.

### How the pieces fit

- **`timing.mjs`** — frame count, fps, easing curves, and `frameToTime()`. The
  single source of truth for the clip's shape; imported by both the page and the
  tests.
- **`server.mjs`** — static server rooted at the repo, because `file://` blocks
  the SVG and JSON fetches under CORS.
- **`intro.html`** — the animation. Exposes `window.INTRO.{fps, frames, ready, seek}`.
- **`render.mjs`** — drives the page one frame at a time through headless Chrome,
  then calls ffmpeg.
- **`extract-route.mjs`** + **`svg-path.mjs`** — turn the hand-drawn `g3922`
  corridor markup in the map SVG into the `route.json` polyline. Run only when the
  SVG changes; the output is committed.

Tests cover the pure logic — the SVG path parser, the keyframe timing, and the
server — so they need neither Chrome nor ffmpeg and run in CI.

## Source material

The camera footage and stills at the repo root are **not tracked**. They are
roughly 1 GB of material that the intro never reads (it only touches `artifacts/`),
and they are backed up separately.

They *were* committed at one point, so they still exist in git history — the
`.gitignore` rules only ever applied to untracked files, and the paths had to be
removed from the index with `git rm --cached` before those rules did anything.
Shrinking the history itself is a separate, irreversible rewrite.
