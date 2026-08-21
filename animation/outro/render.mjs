// `npm run render:outro` — 420 PNGs plus mliniste-outro.mp4.
// `--no-video` stops after the frames.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlates } from '../shared/plates.mjs';
import { renderPiece } from '../shared/render.mjs';
import * as timeline from './timing.mjs';

const pieceDir = resolve(fileURLToPath(new URL('.', import.meta.url)));

await renderPiece({
  piece: 'outro',
  pieceDir,
  plates: createPlates({ timeline, pieceDir }),
  outName: 'mliniste-outro.mp4',
});
