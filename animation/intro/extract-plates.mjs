// `npm run plates:intro` — pulls the opener's footage frames out of the source
// clips. `--force` re-extracts everything rather than only what is stale.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlates } from '../shared/plates.mjs';
import * as timeline from './timing.mjs';

const pieceDir = resolve(fileURLToPath(new URL('.', import.meta.url)));

createPlates({ timeline, pieceDir }).extractAll({ force: process.argv.includes('--force') });
