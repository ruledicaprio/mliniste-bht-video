// `npm run preview:outro` — live, scrubbable preview of the closing sequence.
// All the machinery is in ../shared/server.mjs; this only names the piece.

import { preview } from '../shared/server.mjs';

await preview('outro');
