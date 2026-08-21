// `npm run body` — assembles the body edit from the raw clips and stills.
//
// Two passes:
//   1. Normalize every shot to its own segment under segments/, all identical
//      in codec, resolution, rate and pixel format. This is where the source
//      material's differences are flattened: three of the five clips are
//      1024x576 and one runs at 179/6 fps, and the stills range from 1600x900
//      to 4624x3472 with portrait and square among them.
//   2. Chain the segments with one xfade pass into mliniste-body.mp4.
//
// Segments are cached: a shot is re-encoded only when its definition changes,
// so retuning one cut does not rebuild the whole body. Same idea as the plate
// staleness check in shared/plates.mjs.
//
// Stills are composited over a blurred, darkened copy of themselves scaled to
// cover. For a 16:9 still the contained image fills the frame and the
// background is never seen; for the portrait what-was-needed-* stills it is
// what stops them from being either cropped to pieces or hard-pillarboxed.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from '../shared/ffmpeg.mjs';
import { FPS, W, H } from '../shared/easing.mjs';
import { CUTS, FRAMES, DUR, FADE_FRAMES } from './timing.mjs';
import { XFADE } from './shots.mjs';

const BODY_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(BODY_DIR, '../..');
const SEG_DIR = resolve(BODY_DIR, 'segments');
const OUT = resolve(BODY_DIR, 'mliniste-body.mp4');

/** Encoder settings, identical for the segments and the body, and matching the bookends. */
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p'];

/**
 * Forces limited ("tv") range, which every shot must be converted to.
 *
 * The source material disagrees about this: before-snow-walking.mp4 is full
 * range, before-video-snow-mud.mp4 is limited, and the JPEG stills are full
 * range by definition. Left alone, ffmpeg tags the result yuvj420p and the body
 * lands next to the limited-range bookends with visibly crushed blacks and
 * clipped highlights at both cuts. `-pix_fmt yuv420p` alone does not fix it —
 * that relabels the pixels without rescaling their values, which is precisely
 * the wrong half of the job. The conversion has to happen in the scaler.
 */
const TO_TV = `scale=w=${W}:h=${H}:in_range=auto:out_range=tv,format=yuv420p`;

const pad = (n) => String(n).padStart(3, '0');
const segPath = (i) => resolve(SEG_DIR, `${pad(i)}.mp4`);
const defPath = (i) => resolve(SEG_DIR, `${pad(i)}.json`);

/** A shot is stale when its stored definition no longer matches, or the file is gone. */
function isStale(cut) {
  if (!existsSync(segPath(cut.index))) return true;
  try {
    return readFileSync(defPath(cut.index), 'utf8') !== JSON.stringify(cut);
  } catch {
    return true;
  }
}

/**
 * The Ken Burns move, as a zoompan zoom expression.
 *
 * zoompan counts output frames in `on`, so the ramp is over count-1 frames and
 * lands exactly on the end of the range rather than one frame short.
 */
function zoomExpr(ken, count) {
  const span = Math.max(count - 1, 1);
  return ken === 'out'
    ? `1.10-0.10*on/${span}`
    : `1.00+0.10*on/${span}`;
}

function buildStill(cut) {
  // Composite at 4:3 of the target so zoompan has real detail to crop into,
  // then let zoompan resample down to 1920x1080.
  const CW = W * 4 / 3, CH = H * 4 / 3;
  const filter = [
    `[0:v]scale=${CW}:${CH}:force_original_aspect_ratio=increase,crop=${CW}:${CH},`
      + `boxblur=30:2,eq=brightness=-0.18:saturation=0.7,setsar=1[bg]`,
    `[0:v]scale=${CW}:${CH}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[c]`,
    `[c]zoompan=z='${zoomExpr(cut.ken, cut.count)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
      + `:d=${cut.count}:s=${W}x${H}:fps=${FPS},setsar=1,${TO_TV}[v]`,
  ].join(';');

  runFfmpeg([
    '-y', '-i', resolve(REPO_ROOT, cut.src),
    '-filter_complex', filter, '-map', '[v]',
    '-frames:v', String(cut.count), '-r', String(FPS), '-an',
    ...X264, segPath(cut.index),
  ], { quiet: true });
}

function buildClip(cut) {
  runFfmpeg([
    '-y',
    // Seek before -i so ffmpeg jumps rather than decoding up to the in-point.
    '-ss', String(cut.in), '-i', resolve(REPO_ROOT, cut.src),
    // fps=30 first: it resolves before-video-snow-mud.mp4's 179/6 rate here,
    // the same way shared/plates.mjs resolves the bookends' 30000/1001.
    '-vf', `fps=${FPS},scale=${W}:${H}:flags=lanczos:in_range=auto:out_range=tv,setsar=1,format=yuv420p`,
    '-frames:v', String(cut.count), '-r', String(FPS), '-an',
    ...X264, segPath(cut.index),
  ], { quiet: true });
}

/** Pass 2 — one xfade chain over every segment. */
function chain() {
  const inputs = CUTS.flatMap((c) => ['-i', segPath(c.index)]);
  const steps = [];
  let last = '[0:v]';
  for (let i = 1; i < CUTS.length; i++) {
    const out = i === CUTS.length - 1 ? '[v]' : `[x${i}]`;
    const offset = (CUTS[i - 1].offset / FPS).toFixed(6);
    steps.push(`${last}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${out}`);
    last = out;
  }

  runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', steps.join(';'), '-map', '[v]',
    '-frames:v', String(FRAMES), '-r', String(FPS), '-an',
    ...X264, '-movflags', '+faststart', OUT,
  ], { quiet: true });
}

/* ------------------------------------------------------------------------- */

const force = process.argv.includes('--force');
if (force) rmSync(SEG_DIR, { recursive: true, force: true });
mkdirSync(SEG_DIR, { recursive: true });

const missing = CUTS.filter((c) => !existsSync(resolve(REPO_ROOT, c.src)));
if (missing.length) {
  console.error('missing source material at the repo root:');
  for (const m of missing) console.error(`  ${m.src}`);
  console.error('\nThe footage and stills are untracked — see README, Source material.');
  process.exit(1);
}

const todo = CUTS.filter(isStale);
console.log(`body: ${CUTS.length} shots, ${FRAMES} frames (${DUR.toFixed(2)}s), `
  + `${FADE_FRAMES}-frame dissolves — ${todo.length} to encode`);

for (const cut of todo) {
  process.stdout.write(`  [${pad(cut.index)}] ${cut.kind.padEnd(5)} ${cut.src} (${cut.count}f) ... `);
  if (cut.kind === 'still') buildStill(cut); else buildClip(cut);
  writeFileSync(defPath(cut.index), JSON.stringify(cut));
  console.log('ok');
}

console.log(`chaining ${CUTS.length} segments (this re-encodes the whole body, give it a few minutes)...`);
chain();
console.log(`\n${OUT}`);
