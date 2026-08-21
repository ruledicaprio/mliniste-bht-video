// `npm run assemble` — intro + body + outro -> mliniste-full.mp4.
//
// This is a stream copy, deliberately. The bookends are already final CRF 16
// output; re-encoding them to cross-dissolve into the body would cost a
// generation of quality on ~149 MB of finished picture to buy two transitions
// the film was never authored to have. The outro is written to "cut straight in
// from the body edit", so hard cuts at both joins are the intent, and a hard cut
// is exactly what the concat demuxer can do losslessly.
//
// The price of a stream copy is that every part must agree on its encoding
// parameters. It is cheap to check and expensive to discover later in a player,
// so we probe first and refuse rather than emit a file that decodes wrong.

import { existsSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFfmpeg, runFfprobe } from './shared/ffmpeg.mjs';

const ANIM = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(ANIM, '..');
const OUT = resolve(REPO_ROOT, 'mliniste-full.mp4');
const LIST = resolve(ANIM, 'parts.txt');

const PARTS = [
  { name: 'intro', file: resolve(ANIM, 'intro/mliniste-intro.mp4'), make: 'npm run render:intro' },
  { name: 'body',  file: resolve(ANIM, 'body/mliniste-body.mp4'),   make: 'npm run body' },
  { name: 'outro', file: resolve(ANIM, 'outro/mliniste-outro.mp4'), make: 'npm run render:outro' },
];

/** The fields that must match for a stream copy to produce a decodable file. */
const FIELDS = ['codec_name', 'profile', 'width', 'height', 'pix_fmt', 'r_frame_rate'];

function probe(file) {
  const raw = runFfprobe([
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', `stream=${FIELDS.join(',')}:format=duration`,
    '-of', 'default=nw=1', file,
  ]);
  const out = {};
  for (const line of raw.split('\n')) {
    const [k, v] = line.split('=');
    if (k) out[k.trim()] = (v ?? '').trim();
  }
  return out;
}

/* --- every part must exist ------------------------------------------------ */

const missing = PARTS.filter((p) => !existsSync(p.file));
if (missing.length) {
  console.error('cannot assemble — missing parts:');
  for (const m of missing) console.error(`  ${m.name.padEnd(5)} ${m.file}\n        build it with: ${m.make}`);
  process.exit(1);
}

/* --- and they must agree ------------------------------------------------- */

const probes = PARTS.map((p) => ({ ...p, info: probe(p.file) }));
const [ref, ...rest] = probes;
const mismatches = [];
for (const p of rest) {
  for (const f of FIELDS) {
    if (p.info[f] !== ref.info[f]) {
      mismatches.push(`  ${f}: ${ref.name}=${ref.info[f]} but ${p.name}=${p.info[f]}`);
    }
  }
}

if (mismatches.length) {
  console.error('cannot stream-copy — the parts disagree on encoding:');
  console.error(mismatches.join('\n'));
  console.error(
    '\nA stream copy needs identical parameters. Re-encode the odd part out with the\n'
    + 'settings in animation/body/build.mjs (libx264, preset slow, CRF 16, yuv420p),\n'
    + 'or fall back to a full re-encode:\n'
    + '  ffmpeg -i intro.mp4 -i body.mp4 -i outro.mp4 \\n'
    + '    -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" -map "[v]" \\n'
    + '    -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart mliniste-full.mp4'
  );
  process.exit(1);
}

const total = probes.reduce((n, p) => n + Number(p.info.duration || 0), 0);
for (const p of probes) console.log(`  ${p.name.padEnd(5)} ${Number(p.info.duration).toFixed(2)}s`);
console.log(`  ${'='.repeat(5)} ${total.toFixed(2)}s  ${ref.info.width}x${ref.info.height} `
  + `${ref.info.codec_name} ${ref.info.profile} ${ref.info.pix_fmt} @ ${ref.info.r_frame_rate}`);

/* --- concat -------------------------------------------------------------- */

// The concat demuxer reads paths from a file, and treats a backslash as an
// escape — so Windows paths have to be written with forward slashes. A single
// quote in a path would also need escaping; none of ours contain one.
const listLines = PARTS.map((p) => `file '${p.file.replaceAll('\\', '/')}'`);
writeFileSync(LIST, `${listLines.join('\n')}\n`);

try {
  runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', LIST,
    '-c', 'copy', '-movflags', '+faststart', OUT,
  ]);
} finally {
  unlinkSync(LIST);
}

const got = probe(OUT);
console.log(`\n${OUT}`);
console.log(`  ${Number(got.duration).toFixed(2)}s, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);

// Concat drops nothing, so a duration more than a frame off means a part was
// truncated or the demuxer re-timed something.
if (Math.abs(Number(got.duration) - total) > 1 / 30) {
  console.warn(`\nwarning: expected ${total.toFixed(2)}s but got ${Number(got.duration).toFixed(2)}s`);
}
