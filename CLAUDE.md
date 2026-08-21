# mliniste-bht-video

The BH Telecom infrastructure film for the **Mlinište** site — the micro base
station on the M-15 Glamoč–Livno road at the Mlinište pass
(44°15'55"N 16°51'06"E, 1155 m).

This file is the standing brief: what the film is about, and the rules the code
that renders it must not break. `README.md` is the operator's manual — how to run
things. Read this one before changing what the film *says*; read that one before
changing how it is built.

## What the film is about

Three questions were asked when this project started and never answered. They are
answered here, because the code has since answered them by construction.

**Technical document or creative storyboard?** Both, kept apart. The story lives
in this file and in `animation/body/shots.mjs`, which *is* the storyboard — a
readable list of every shot in order, with its duration. The technical contract
lives in "Rules the code keeps" below. Neither section should start explaining the
other.

**The central focus: technological endurance in extreme conditions.** Not the
nature/technology contrast, and not the brand line — those serve it. The contrast
is the *visual language*: a mast against fog, an antenna against an open valley.
"Behind the mountain we deliver more" is the *closing argument*, landed once. If a
change makes the film more about the scenery or more about the branding than about
the fact that this site keeps working when the road is shut, it is the wrong change.

**A specific process, or the wider operation?** A narrow spine with a wide payoff.
The spine is the genset and container replacement — it is the only *during* clip
and it carries the strongest stills. The payoff is what that replacement bought:
hybrid power, solar, batteries, 72 h of autonomy. The film earns the general claim
by showing one particular hard job done well, not by asserting it over a montage.

### The arc

Four acts, in this order. `shots.mjs` declares each shot's `act` explicitly and the
tests enforce that they never run out of order.

| Act | Beat | Material |
| :--- | :--- | :--- |
| — | **Intro** (28 s) | Map, M-15 corridor, coverage bloom, push-in to drone footage. No brand mark. |
| 1 | **The challenge** | Snow, mud, fog, and a generator at 15,000 hours. Getting there at all. |
| 2 | **What was needed** | The requirements, stated plainly: 72 h capacity, power and batteries, secure diesel, cooling, distribution. |
| 3 | **The job** | Tree cutters, the lift, the container and genset going in. The spine. |
| 4 | **The result** | Hybrid power standing on the mountain. Ends wide and calm. |
| — | **Outro** (14 s) | Cuts straight in on the finished compound, pulls back to national scale, lands the logo. One brand hit, alone, at the end. |

Total: 110.5 s.

## Rules the code keeps

These are invariants, not preferences. Each exists because breaking it produced a
real bug.

**Determinism.** Every visual in the intro and outro is a pure function of the
frame index. Nothing reads the wall clock. The headless render and the live
preview must produce identical pixels. `animation/shared/easing.mjs` is pure by
policy — do not introduce `Date`, `Math.random`, or anything ambient into it.

**Seconds become frames in exactly one place, per piece.** For the bookends that
is `frameSpan()` in `animation/shared/timeline.mjs`; for the body it is `frames()`
in `animation/body/timing.mjs`. A second rounding site means a phase edge that is
180 frames in one file and 181 in another, and the failure surfaces as a silently
short segment much later. Never round durations at a call site.

**Footage phases own exclusive, contiguous frame ranges.** Graphic phases may
overlap — that overlap *is* the dissolve. Footage phases may not.

**Move a footage phase edge and you must re-extract that piece's plates.** The
test suite fails loudly when a plate count no longer matches its span. That
failure is correct; fix the plates, not the test.

**Colour range is normalized to limited ("tv") at the edge.** The source material
disagrees: `before-snow-walking.mp4` is full range, `before-video-snow-mud.mp4` is
limited, and every JPEG still is full range. `-pix_fmt yuv420p` does not fix this
— it relabels pixels without rescaling them. The conversion belongs in the scaler
(`TO_TV` in `animation/body/build.mjs`). Get this wrong and the body lands beside
the bookends with crushed blacks at both cuts.

**The final assembly is a stream copy, and must stay one.** `animation/assemble.mjs`
concatenates three finished MP4s without re-encoding, so the bookends reach the
film bit-exact. That only works while all three parts agree on codec, profile,
resolution, pixel format and frame rate — which is why assemble probes and refuses
rather than emitting a file that decodes wrong. Anything new that joins the film
must be encoded to match: libx264, preset slow, CRF 16, yuv420p, 1920×1080, 30 fps.

**Picture quality is a casting decision, not an encoder setting.** Only
`before-snow-walking.mp4` and `before-snow-walking-3.mp4` are natively 1080p; the
other three clips are 1024×576 and upscale 1.875×. The sharp material carries the
long held wides and the soft material gets short, tight cuts. If an upscaled shot
looks bad, shorten it in `shots.mjs` — do not reach for sharpening or a lower CRF.

## Working on this repo

- The footage and stills at the repo root are **untracked**, ~1 GB, backed up
  separately. A fresh clone can run `npm test` and preview the graphic phases, but
  cannot render.
- Render output — frames, plates, segments, and every MP4 — is untracked and fully
  regenerable. Do not commit it. This repo was over-filled with media once and the
  history had to be purged to recover; see `README.md`, "The history rewrite". Do
  not run another rewrite or force-push without a fresh, specific instruction.
- CI runs the pure-logic tests only. It has no Chrome, no ffmpeg and no footage,
  and that is deliberate.
- `artifacts/` holds the assets the pieces actually draw plus reference material.
  `artifacts/context-for-geo-map-zoom-artifact.md` is the original research dump
  the film was scoped from — it is unedited, partly machine-garbled, and is
  history, not instruction. This file supersedes it.
