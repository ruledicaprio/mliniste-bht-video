// Minimal static file server rooted at the repo, so intro.html can fetch
// route.json and the SVG backdrop over http:// — file:// blocks both under CORS.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const PAGE_PATH = '/animation/intro/intro.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

export function startServer(root = REPO_ROOT) {
  const server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^[/\\]+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      res({ port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// `node server.mjs` on its own = live preview server.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`preview: ${s.origin}${PAGE_PATH}`);
  console.log('ctrl+c to stop');
}
