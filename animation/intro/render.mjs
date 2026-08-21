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

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('No Chrome/Edge found. Set CHROME_PATH to a browser executable.');
}

const makeVideo = !process.argv.includes('--no-video');

rmSync(FRAME_DIR, { recursive: true, force: true });
mkdirSync(FRAME_DIR, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));

  await page.goto(`${server.origin}${PAGE_PATH}?render=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__introReady === true', { timeout: 60_000 });

  const frames = await page.evaluate('window.INTRO.frames');
  console.log(`rendering ${frames} frames at 1920x1080...`);

  for (let f = 0; f < frames; f++) {
    const dataUrl = await page.evaluate((n) => {
      window.INTRO.seek(n);
      return document.getElementById('c').toDataURL('image/png');
    }, f);
    writeFileSync(
      resolve(FRAME_DIR, `frame_${String(f).padStart(4, '0')}.png`),
      Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
    );
    if (f % 30 === 0 || f === frames - 1) process.stdout.write(`\r  ${f + 1}/${frames}`);
  }
  process.stdout.write('\n');
} finally {
  await browser.close();
  await server.close();
}

if (!makeVideo) {
  console.log(`frames written to ${FRAME_DIR}`);
  process.exit(0);
}

const ff = spawnSync('ffmpeg', [
  '-y',
  '-framerate', '30',
  '-i', resolve(FRAME_DIR, 'frame_%04d.png'),
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '16',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  OUT_MP4,
], { stdio: 'inherit' });

if (ff.status !== 0) {
  console.error('ffmpeg failed — frames are still in ' + FRAME_DIR);
  process.exit(ff.status ?? 1);
}
console.log(`\ndone: ${OUT_MP4}`);
