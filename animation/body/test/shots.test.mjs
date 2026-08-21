// The body's shot list is data, and data that is wrong here fails slowly: the
// builder re-encodes for minutes before ffmpeg complains, or worse, silently
// produces a short segment because a shot ran off the end of its clip.
//
// These are pure checks over shots.mjs and timing.mjs, so they need neither
// ffmpeg nor the untracked footage and run in CI beside the bookend tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FPS } from '../../shared/easing.mjs';
import { SHOTS, XFADE, CLIP_DUR } from '../shots.mjs';
import { CUTS, FRAMES, DUR, FADE_FRAMES, frames } from '../timing.mjs';

test('every shot declares a source and a positive duration', () => {
  for (const [i, s] of SHOTS.entries()) {
    assert.ok(s.src, `shot ${i} has no src`);
    assert.ok(s.dur > 0, `shot ${i} (${s.src}) has dur ${s.dur}`);
    assert.ok(['clip', 'still'].includes(s.kind), `shot ${i} has kind ${s.kind}`);
  }
});

test('no clip shot runs off the end of its source', () => {
  for (const s of SHOTS.filter((s) => s.kind === 'clip')) {
    const total = CLIP_DUR[s.src];
    assert.ok(total !== undefined, `${s.src} is not in CLIP_DUR`);
    assert.ok(typeof s.in === 'number' && s.in >= 0, `${s.src} has in ${s.in}`);
    assert.ok(
      s.in + s.dur <= total,
      `${s.src}: ${s.in}+${s.dur}=${s.in + s.dur}s exceeds the clip's ${total}s`
    );
  }
});

test('every still declares a Ken Burns direction', () => {
  for (const s of SHOTS.filter((s) => s.kind === 'still')) {
    assert.ok(['in', 'out'].includes(s.ken), `${s.src} has ken ${s.ken}`);
  }
});

test('the dissolve is shorter than the shortest shot', () => {
  // xfade consumes XFADE seconds from each side of a join. A shot shorter than
  // the dissolve would be entirely swallowed and the offsets would go backwards.
  const shortest = Math.min(...SHOTS.map((s) => s.dur));
  assert.ok(XFADE < shortest, `XFADE ${XFADE}s is not shorter than ${shortest}s`);
  assert.ok(FADE_FRAMES > 0, 'the dissolve rounds to zero frames');
});

test('seconds become frames in exactly one place', () => {
  // The same rule shared/timeline.mjs enforces for the bookends: if any caller
  // rounded on its own, the builder and the tests would disagree by a frame.
  for (const c of CUTS) {
    assert.equal(c.count, Math.round(c.dur * FPS), `${c.src} frame count`);
  }
  assert.equal(frames(1), FPS);
  assert.equal(FADE_FRAMES, Math.round(XFADE * FPS));
});

test('the body length is the sum of the shots less every dissolve', () => {
  const sum = CUTS.reduce((n, c) => n + c.count, 0);
  assert.equal(FRAMES, sum - (CUTS.length - 1) * FADE_FRAMES);
  assert.equal(DUR, FRAMES / FPS);
  assert.ok(Number.isInteger(FRAMES), `FRAMES is ${FRAMES}`);
});

test('xfade offsets advance monotonically and leave room for each dissolve', () => {
  // Each offset is where the NEXT shot starts fading in. If two offsets were
  // closer together than the dissolve, xfade would be asked to overlap a shot
  // that has not finished appearing.
  let prev = -Infinity;
  for (const c of CUTS) {
    assert.ok(c.offset > prev, `offset went backwards at shot ${c.index} (${c.src})`);
    if (prev !== -Infinity) {
      assert.ok(
        c.offset - prev >= FADE_FRAMES,
        `shots ${c.index - 1}->${c.index} are ${c.offset - prev} frames apart, dissolve is ${FADE_FRAMES}`
      );
    }
    prev = c.offset;
  }
});

test('the first shot is fully visible before the first dissolve begins', () => {
  assert.equal(CUTS[0].offset, CUTS[0].count - FADE_FRAMES);
  assert.ok(CUTS[0].offset > 0, 'the body dissolves before its first shot has played');
});

test('the final chain step ends exactly on the body length', () => {
  // The last offset plus one dissolve plus the remainder of the last shot must
  // land on FRAMES, or the xfade chain and the -frames:v cap disagree.
  const last = CUTS.at(-1);
  assert.equal(last.offset, FRAMES - FADE_FRAMES);
});

test('the acts run in order and none is empty', () => {
  // A regression guard on the edit itself: reordering shots by hand is easy and
  // silently turns the story inside out. The act is declared per shot rather
  // than inferred from the filename, because the filenames lie -- Act 3 opens
  // partly on before-during-* material.
  let act = 1;
  for (const s of SHOTS) {
    assert.ok([1, 2, 3, 4].includes(s.act), `${s.src} has act ${s.act}`);
    assert.ok(s.act >= act, `${s.src} (act ${s.act}) appears after act ${act}`);
    act = s.act;
  }
  assert.equal(act, 4, 'the body does not reach act 4');
  for (const n of [1, 2, 3, 4]) {
    assert.ok(SHOTS.some((s) => s.act === n), `act ${n} has no shots`);
  }
});

test('the job and the result rest on the material named for them', () => {
  const act = (n) => SHOTS.filter((s) => s.act === n).map((s) => s.src);
  assert.ok(act(2).every((src) => /what-was-needed-|requirements/.test(src)),
    'act 2 contains something that is not a requirement still');
  assert.ok(act(3).some((src) => src.includes('genset-replacement')),
    'act 3 never shows the replacement it is about');
});
