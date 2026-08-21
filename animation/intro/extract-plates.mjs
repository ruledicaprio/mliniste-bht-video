// Extracts the live-footage frames the intro composites over.
//
//   node extract-plates.mjs           -> extract any phase that is missing/stale
//   node extract-plates.mjs --force   -> re-extract everything
//
// Each footage phase in timing.mjs owns a contiguous block of output frames.
// This writes exactly that many JPEGs into plates/<PHASE>/, numbered from 0,
// so output frame `first + k` composites plate `k` with no arithmetic in the
// browser.
//
// The `fps=30` filter is doing real work: both sources are 30000/1001, and
// resampling here — once, in ffmpeg — is what keeps the 29.97/30 mismatch out
// of the renderer entirely.
//
// Output is JPEG, not PNG. At ~250 KB a frame the whole cache is ~110 MB
// against ~900 MB for PNG, and every one of these frames ends up under a HUD
// and a vignette. The directory is regenerable and gitignored.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, PHASES, FOOTAGE_PHASES, frameSpan } from './timing.mjs';
import { runFfmpeg } from './ffmpeg.mjs';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
export const PLATE_DIR = resolve(HERE, 'plates');

/** How many plates a phase's directory actually holds right now. */
export function plateCount(name) {
  const dir = resolve(PLATE_DIR, name);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
}

/** Phases whose extracted plates do not match what timing.mjs now asks for. */
export function stalePhases() {
  return FOOTAGE_PHASES.filter((n) => plateCount(n) !== frameSpan(n).count);
}

function extract(name) {
  const phase = PHASES[name];
  const { count } = frameSpan(name);
  const src = resolve(HERE, phase.src);
  if (!existsSync(src)) {
    throw new Error(
      `source clip missing for phase ${name}: ${src}\n` +
      '  Source footage is untracked and lives on disk only — see README.'
    );
  }

  const dir = resolve(PLATE_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  console.log(`${name}: ${count} frames from ${phase.in}s of ${phase.src.replace(/^.*\//, '')}`);
  runFfmpeg([
    '-y',
    '-ss', String(phase.in),      // before -i: fast seek to the keyframe, then
    '-i', src,                    //   ffmpeg decodes forward to the exact point
    '-frames:v', String(count),
    '-vf', `fps=${FPS}`,
    '-q:v', '2',
    '-start_number', '0',        // the renderer indexes plates from 0, not 1
    resolve(dir, '%04d.jpg'),
  ], { quiet: true });

  const got = plateCount(name);
  if (got !== count) {
    throw new Error(`${name}: expected ${count} plates, ffmpeg produced ${got} — is the clip long enough past ${phase.in}s?`);
  }
}

// Extract only when this file is the entry point. render.mjs imports
// stalePhases() from here to check the cache before it launches Chrome, and
// that import must not kick off a 400 MB ffmpeg job as a side effect.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  const todo = force ? FOOTAGE_PHASES : stalePhases();
  if (!todo.length) {
    console.log('plates are up to date');
  } else {
    for (const name of todo) extract(name);
    console.log(`\ndone: ${PLATE_DIR}`);
  }
}
