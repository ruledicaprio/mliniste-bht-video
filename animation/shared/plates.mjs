// Extracts the live-footage frames a piece composites over.
//
// Each footage phase in a piece's timing.mjs owns a contiguous block of output
// frames. This writes exactly that many JPEGs into <piece>/plates/<PHASE>/,
// numbered from 0, so output frame `first + k` composites plate `k` with no
// arithmetic in the browser.
//
// The `fps=30` filter is doing real work: both sources are 30000/1001, and
// resampling here — once, in ffmpeg — is what keeps the 29.97/30 mismatch out
// of the renderer entirely.
//
// Output is JPEG, not PNG. At ~250 KB a frame that is a fraction of the PNG
// cost, and every one of these frames ends up under a HUD and a vignette. The
// directory is regenerable and gitignored.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { FPS } from './easing.mjs';
import { runFfmpeg } from './ffmpeg.mjs';

/**
 * Binds the plate machinery to one piece.
 *
 * @param timeline  the piece's makeTimeline() result
 * @param pieceDir  absolute path of the piece's directory; phase `src` paths
 *                  and the plates/ output are both resolved against it
 */
export function createPlates({ timeline, pieceDir }) {
  const { PHASES, FOOTAGE_PHASES, frameSpan } = timeline;
  const PLATE_DIR = resolve(pieceDir, 'plates');

  /** How many plates a phase's directory actually holds right now. */
  function plateCount(name) {
    const dir = resolve(PLATE_DIR, name);
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  }

  /** Phases whose extracted plates do not match what the timeline now asks for. */
  function stalePhases() {
    return FOOTAGE_PHASES.filter((n) => plateCount(n) !== frameSpan(n).count);
  }

  function extract(name) {
    const phase = PHASES[name];
    const { count } = frameSpan(name);
    const src = resolve(pieceDir, phase.src);
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

  /**
   * Extracts every stale phase, or every phase when forced.
   *
   * Callers must invoke this explicitly: a renderer imports stalePhases() to
   * check the cache before it launches Chrome, and that import must not kick
   * off a multi-hundred-megabyte ffmpeg job as a side effect.
   */
  function extractAll({ force = false } = {}) {
    const todo = force ? FOOTAGE_PHASES : stalePhases();
    if (!todo.length) {
      console.log('plates are up to date');
      return;
    }
    for (const name of todo) extract(name);
    console.log(`\ndone: ${PLATE_DIR}`);
  }

  return { PLATE_DIR, plateCount, stalePhases, extract, extractAll };
}
