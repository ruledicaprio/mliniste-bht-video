// `npm run preview:intro` — live, scrubbable preview of the opener.
// All the machinery is in ../shared/server.mjs; this only names the piece.

import { preview } from '../shared/server.mjs';

await preview('intro');
