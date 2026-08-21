// One place that knows how to invoke ffmpeg, so the renderer and the plate
// extractor report a missing binary the same way.

import { spawnSync } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Runs ffmpeg synchronously and throws with a useful message on failure.
 *
 * spawnSync sets `status` to null when the binary could not be started at all,
 * so checking only the exit code reports "ffmpeg failed" for what is really
 * "ffmpeg is not installed".
 *
 * @param {string[]} args
 * @param {{quiet?: boolean}} [opts]
 */
export function runFfmpeg(args, { quiet = false } = {}) {
  const ff = spawnSync(FFMPEG, args, { stdio: quiet ? 'pipe' : 'inherit' });

  if (ff.error) {
    if (ff.error.code === 'ENOENT') {
      throw new Error(
        `ffmpeg not found (tried "${FFMPEG}"). Install it or set FFMPEG_PATH to the executable.\n` +
        '  On Windows a scoop/choco shim may be a .cmd — point FFMPEG_PATH at it directly.'
      );
    }
    throw new Error(`could not run ffmpeg: ${ff.error.message}`);
  }
  if (ff.status !== 0) {
    const tail = quiet && ff.stderr ? `\n${ff.stderr.toString().trim().split('\n').slice(-8).join('\n')}` : '';
    throw new Error(`ffmpeg exited ${ff.status}${tail}`);
  }
  return ff;
}
