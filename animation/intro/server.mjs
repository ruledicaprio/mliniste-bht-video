// Minimal static file server rooted at the repo, so intro.html can fetch
// route.json and the SVG backdrop over http:// — file:// blocks both under CORS.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
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

/**
 * True when `file` really sits under `root`.
 *
 * A `startsWith(root)` string compare is not enough: a sibling directory such
 * as `<root>-secrets` shares the prefix and would pass.
 */
export function isInsideRoot(root, file) {
  const rel = relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Maps a request URL to an on-disk path, or null if it escapes the root. */
export function resolveRequestPath(root, url) {
  const rel = normalize(decodeURIComponent(String(url).split('?')[0])).replace(/^[/\\]+/, '');
  const file = join(root, rel);
  return isInsideRoot(root, file) ? file : null;
}

export function startServer(root = REPO_ROOT) {
  const server = createServer((req, res) => {
    let file;
    try {
      // decodeURIComponent throws on a malformed escape such as `/%`. Left
      // uncaught this takes down the whole process mid-render.
      file = resolveRequestPath(root, req.url ?? '/');
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (file === null) { res.writeHead(403).end('forbidden'); return; }

    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch {
      res.writeHead(404).end('not found');
      return;
    }

    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    const stream = createReadStream(file);
    // The file can vanish between statSync and the open; an unhandled 'error'
    // on the stream is fatal to the process.
    stream.on('error', (e) => {
      console.error(`serve ${file}: ${e.message}`);
      res.destroy();
    });
    stream.pipe(res);
  });

  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rej);
      const { port } = server.address();
      res({
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => {
          // Chrome holds keep-alive sockets open; without this close() hangs.
          server.closeAllConnections?.();
          server.close(done);
        }),
      });
    });
  });
}

// `node server.mjs` on its own = live preview server.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`preview: ${s.origin}${PAGE_PATH}`);
  console.log('ctrl+c to stop');
}
