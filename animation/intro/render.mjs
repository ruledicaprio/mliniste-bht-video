// Headless frame render: drives intro.html one frame at a time through the
// locally installed Chrome, dumps 1920x1080 PNGs, then muxes them with ffmpeg.
//
//   node render.mjs            -> frames/ + mliniste-intro.mp4
//   node render.mjs --no-video -> frames only
//
// Frames come off the canvas via toDataURL, not page.screenshot, so the output
// is exact canvas pixels regardless of how CSS scales the element for preview.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer, PAGE_PATH } from './server.mjs';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const FRAME_DIR = resolve(HERE, 'frames');
const OUT_MP4 = resolve(HERE, 'mliniste-intro.mp4');
const PNG_PREFIX = 'data:image/png;base64,';

const CHROME_CANDIDATES = [
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

function findChrome() {
  // An explicit CHROME_PATH is an override, not a hint: if it is wrong, say so
  // rather than quietly rendering through some other browser.
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH is set but does not exist: ${process.env.CHROME_PATH}`);
    }
    return process.env.CHROME_PATH;
  }
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('No Chrome/Edge found. Set CHROME_PATH to a browser executable.');
}

const makeVideo = !process.argv.includes('--no-video');

// Resolve the browser before touching the filesystem or opening a socket, so a
// missing Chrome fails immediately instead of leaving a listening server whose
// open handle keeps the process alive forever.
const chrome = findChrome();

rmSync(FRAME_DIR, { recursive: true, force: true });
mkdirSync(FRAME_DIR, { recursive: true });

let server = null;
let browser = null;
let fps;

try {
  server = await startServer();
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));

  await page.goto(`${server.origin}${PAGE_PATH}?render=1`, { waitUntil: 'load' });

  // The page reports failure explicitly; without this a broken asset just sits
  // here until the timeout and reports nothing useful.
  await page.waitForFunction(
    'window.__introReady === true || window.__introError !== undefined',
    { timeout: 60_000 }
  );
  const pageError = await page.evaluate('window.__introError ?? null');
  if (pageError) throw new Error(`intro.html failed to load its assets: ${pageError}`);

  const frames = await page.evaluate('window.INTRO.frames');
  fps = await page.evaluate('window.INTRO.fps');
  console.log(`rendering ${frames} frames at 1920x1080, ${fps}fps...`);

  for (let f = 0; f < frames; f++) {
    const dataUrl = await page.evaluate((n) => {
      window.INTRO.seek(n);
      return document.getElementById('c').toDataURL('image/png');
    }, f);
    if (!dataUrl.startsWith(PNG_PREFIX)) {
      throw new Error(`frame ${f}: canvas did not return a PNG data URL (got "${dataUrl.slice(0, 32)}...")`);
    }
    writeFileSync(
      resolve(FRAME_DIR, `frame_${String(f).padStart(4, '0')}.png`),
      Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64')
    );
    if (f % 30 === 0 || f === frames - 1) process.stdout.write(`\r  ${f + 1}/${frames}`);
  }
  process.stdout.write('\n');
} finally {
  // Independently, so a failure closing one still releases the other.
  if (browser) await browser.close().catch((e) => console.error('browser close:', e.message));
  if (server) await server.close().catch((e) => console.error('server close:', e.message));
}

if (!makeVideo) {
  console.log(`frames written to ${FRAME_DIR}`);
  process.exit(0);
}

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

const ff = spawnSync(FFMPEG, [
  '-y',
  '-framerate', String(fps),
  '-i', resolve(FRAME_DIR, 'frame_%04d.png'),
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '16',
  '-pix_fmt', 'yuv420p',
  '-r', String(fps),
  '-movflags', '+faststart',
  OUT_MP4,
], { stdio: 'inherit' });

// ff.status is null when the binary could not be spawned at all, so checking
// only the status reports "ffmpeg failed" for what is really "ffmpeg missing".
if (ff.error) {
  const missing = ff.error.code === 'ENOENT';
  console.error(
    missing
      ? `ffmpeg not found (tried "${FFMPEG}"). Install it or set FFMPEG_PATH to the executable.\n` +
        '  On Windows a scoop/choco shim may be a .cmd — point FFMPEG_PATH at it directly.'
      : `could not run ffmpeg: ${ff.error.message}`
  );
  console.error(`frames are still in ${FRAME_DIR}`);
  process.exit(1);
}
if (ff.status !== 0) {
  console.error(`ffmpeg exited ${ff.status} — frames are still in ${FRAME_DIR}`);
  process.exit(ff.status ?? 1);
}
console.log(`\ndone: ${OUT_MP4}`);
