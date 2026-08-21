// `npm run render:intro` — 840 PNGs plus mliniste-intro.mp4.
// `--no-video` stops after the frames.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlates } from '../shared/plates.mjs';
import { renderPiece } from '../shared/render.mjs';
import * as timeline from './timing.mjs';

const pieceDir = resolve(fileURLToPath(new URL('.', import.meta.url)));

await renderPiece({
  piece: 'intro',
  pieceDir,
  plates: createPlates({ timeline, pieceDir }),
  outName: 'mliniste-intro.mp4',
});
