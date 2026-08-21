import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer, PAGE_PATH, isInsideRoot, resolveRequestPath } from '../server.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.close(); });

/** Raw request, so we can send paths that fetch() would refuse to construct. */
function raw(path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('isInsideRoot rejects a sibling directory sharing the root prefix', () => {
  // The old startsWith(root) check let this through.
  const root = '/srv/mliniste-bht-video';
  assert.equal(isInsideRoot(root, '/srv/mliniste-bht-video/animation/intro.html'), true);
  assert.equal(isInsideRoot(root, '/srv/mliniste-bht-video-secrets/creds.txt'), false);
});

test('isInsideRoot rejects the root itself and parent traversal', () => {
  const root = '/srv/app';
  assert.equal(isInsideRoot(root, '/srv/app'), false);
  assert.equal(isInsideRoot(root, '/srv/other'), false);
});

test('resolveRequestPath neutralizes traversal instead of escaping the root', () => {
  // normalize() collapses the leading ../ before the join, so this lands inside
  // the root (and 404s) rather than reaching /etc. isInsideRoot above is the
  // independent backstop for anything normalize does not catch.
  const root = '/srv/app';
  assert.equal(isInsideRoot(root, resolveRequestPath(root, '/../../etc/passwd')), true);
  assert.equal(isInsideRoot(root, resolveRequestPath(root, '/%2e%2e/%2e%2e/etc/passwd')), true);
});

test('serves the intro page', async () => {
  const res = await raw(PAGE_PATH);
  assert.equal(res.status, 200);
  assert.match(res.type, /^text\/html/);
  assert.match(res.body, /MLINIŠTE/);
});

test('serves route.json as application/json', async () => {
  const res = await raw('/animation/intro/route.json');
  assert.equal(res.status, 200);
  assert.match(res.type, /^application\/json/);
  assert.equal(JSON.parse(res.body).segments, 3);
});

test('serves .mjs as javascript so the page can import it', async () => {
  const res = await raw('/animation/intro/timing.mjs');
  assert.equal(res.status, 200);
  assert.match(res.type, /javascript/);
});

test('404s a missing file', async () => {
  const res = await raw('/animation/intro/nope.json');
  assert.equal(res.status, 404);
});

test('404s a directory', async () => {
  const res = await raw('/animation/intro');
  assert.equal(res.status, 404);
});

test('ignores the query string when resolving', async () => {
  const res = await raw(`${PAGE_PATH}?render=1`);
  assert.equal(res.status, 200);
});

test('a malformed percent escape gets a 400, and the server survives it', async () => {
  // decodeURIComponent throws here; uncaught it killed the whole render.
  const res = await raw('/%');
  assert.equal(res.status, 400);

  const after = await raw(PAGE_PATH);
  assert.equal(after.status, 200, 'server died on the malformed request');
});

test('traversal out of the root is forbidden', async () => {
  const res = await raw('/../../../etc/passwd');
  // Node normalizes some of this client-side; either rejection is acceptable,
  // what matters is that the file never comes back.
  assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
});
