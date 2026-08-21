// The shared picture: the national map, the M-15 corridor, the coverage
// raster, the push-in transform and the glass, plus the assets and geometry
// they need.
//
// These are PRIMITIVES, not keyframed layers. Nothing here takes `t` — each
// one takes the alphas and progressions it should draw at, and every piece
// maps its own hand-tuned keyframes onto them. That is what lets the intro
// push in on the map and the outro pull back out of it without either one
// inheriting the other's timing.
//
// Act-specific furniture — the reticle, the scan sweep, the backdrop grid, the
// site tag — deliberately stays in the pages. Only what both pieces draw the
// same way lives here.

import {
  W, H, clamp01, ramp, easeOut, lerp, hexToRgb, rgba,
} from './easing.mjs';

/* --- palette ------------------------------------------------------------- */
export const ORANGE = '#f5821f';          // BH Telecom brand orange (bht-logo.svg)
export const CYAN   = '#38e1ff';
export const DIM    = '#1d6f86';
export const INK    = '#04141a';

/* --- where the site sits on the traced corridor ---------------------------
   Mlinište pass is a fraction along the M-15 markup polyline, measured from its
   northern end. Nudge SITE_T if the reticle should sit further up or down the
   corridor — everything else (callout, coverage bloom origin) follows it.      */
export const SITE_T = 0.597;

/** The one label the site gets. Everything else was noise. */
export const SITE_LABEL = 'MLINIŠTE_MIKRO';

/* --- national coverage raster registration --------------------------------
   bht-coverage-raster-photo.png is a 4000x4000 plate whose grey pixels are the
   covered area of BiH. These fractions are the bounding box of that grey region
   (measured once with ffmpeg + a pixel scan); the raster is stretched so this
   box lands on the BiH landmass of the map SVG, keeping both in one region.    */
export const COVERAGE_BOX = { x0: 0.251, y0: 0.154, x1: 0.973, y1: 0.919 };

/* --- map placement on the 1920x1080 frame --------------------------------- */
export const MAP = { x: 210, y: 40, w: 1000, h: 1000 };

const ART = '../../artifacts/';
const ROUTE_URL = '../shared/route.json';

/* =============================== loading ================================== */

/** fetch that fails loudly on 404 instead of handing a "not found" body to .json()/.text(). */
export async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  return res;
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('failed to load ' + src));
    img.src = src;
  });
}

/**
 * The national map SVG ships as a printable atlas (grey plate, cream landmass,
 * orange road network). Recolor it in-place into a dark HUD backdrop, and drop
 * the M-15 markup entirely — the pieces animate that corridor themselves.
 */
async function loadMapBackdrop() {
  const svg = await (await fetchOk(ART + 'bih-motorway-m15-glamoc-livno-segment.svg')).text();
  const themed = svg
    .replace(/<rect\b[^>]*id="rect3"[^>]*\/>/s, '')     // drop the grey page plate
    .replace(/fill="#FEFEE9"/gi, 'data-bih="1" fill="#0a2733"')  // landmass, tagged
    .replace(/#FEFEE9/gi, '#0a2733')
    .replace(/#C6ECFF/gi, '#061c25')                     // water
    .replace(/#ff6600/gi, DIM)                           // magistralni network, dimmed
    .replace(/#803300/gi, 'none');                       // M-15 markup: we draw it

  // Measure the BiH landmass in SVG user units by mounting the themed SVG
  // off-screen — getBBox is exact, and beats guessing at the country's extent.
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px';
  holder.innerHTML = themed;
  document.body.appendChild(holder);
  const bihEl = holder.querySelector('[data-bih]');
  const b = bihEl ? bihEl.getBBox() : null;
  holder.remove();

  const url = URL.createObjectURL(new Blob([themed], { type: 'image/svg+xml' }));
  try {
    return { img: await loadImage(url), bbox: b && { x: b.x, y: b.y, w: b.width, h: b.height } };
  } finally {
    URL.revokeObjectURL(url);   // the decoded image outlives the blob URL
  }
}

/**
 * Turns the national coverage plate into a premultiplied orange mask: grey
 * (covered) becomes brand orange at full alpha, everything else transparent.
 * Downsampled to 1400px — it is only ever drawn about 900px wide.
 */
async function loadCoverageMask() {
  const img = await loadImage(ART + 'bht-coverage-raster-photo.png');
  const N = 1400;
  const off = document.createElement('canvas');
  off.width = off.height = N;
  const c = off.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, N, N);
  const data = c.getImageData(0, 0, N, N);
  const px = data.data;
  const [OR, OG, OB] = hexToRgb(ORANGE);
  for (let i = 0; i < px.length; i += 4) {
    const covered = px[i] > 60 && px[i] < 160;   // grey plateau = has service
    if (covered) { px[i] = OR; px[i + 1] = OG; px[i + 2] = OB; px[i + 3] = 255; }
    else px[i + 3] = 0;
  }
  c.putImageData(data, 0, 0);
  return off;
}

/**
 * Maps the corridor polyline from SVG user units into frame coordinates and
 * precomputes cumulative arc length, so the trace can be drawn by distance
 * rather than by vertex index (constant apparent speed regardless of spacing).
 */
function prepareRoute(route) {
  const vb = route.viewBox;
  const scale = Math.min(MAP.w / vb.width, MAP.h / vb.height);
  const ox = MAP.x + (MAP.w - vb.width * scale) / 2;
  const oy = MAP.y + (MAP.h - vb.height * scale) / 2;

  const pts = route.points.map(([x, y]) => [ox + x * scale, oy + y * scale]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, cum, total: cum.at(-1), scale, ox, oy, vb };
}

/* ================================ scene =================================== */

/**
 * Loads every shared asset and returns the primitives bound to one context.
 *
 * @param ctx        an opaque 2d context on a W x H canvas
 * @param plateRoot  URL prefix for this piece's extracted footage plates
 * @param plateCache how many decoded plates to keep (a hard memory ceiling —
 *                   each is a ~8 MB 1920x1080 bitmap)
 */
export async function createScene(ctx, { plateRoot = './plates/', plateCache = 6 } = {}) {
  const assets = {};

  const [route, map, coverage, logo] = await Promise.all([
    fetchOk(ROUTE_URL).then((r) => r.json()),
    loadMapBackdrop(),
    loadCoverageMask(),
    loadImage(ART + 'bht-logo.svg'),
  ]);
  assets.route = prepareRoute(route);
  assets.map = map.img;
  assets.coverage = coverage;
  assets.logo = logo;

  /** Converts a rect in SVG user units into frame coordinates. */
  function mapBoxToScreen(b) {
    if (!b) return null;
    const { scale, ox, oy } = assets.route;
    return { x: ox + b.x * scale, y: oy + b.y * scale, w: b.w * scale, h: b.h * scale };
  }
  assets.bih = mapBoxToScreen(map.bbox);

  // Warm the font stack so the first rendered frame measures text identically.
  ctx.font = '400 20px ui-monospace, Consolas, monospace';
  ctx.measureText('warm');

  /* ---------------------------- geometry --------------------------------- */

  /** Point at arc-length fraction f (0..1) along the corridor. */
  function pointAt(f) {
    const { pts, cum, total } = assets.route;
    const target = clamp01(f) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const p = (target - cum[i - 1]) / span;
    return [lerp(pts[i - 1][0], pts[i][0], p), lerp(pts[i - 1][1], pts[i][1], p)];
  }

  /** Traces the corridor from its start up to arc-length fraction f. */
  function strokeRoute(f) {
    const { pts, cum, total } = assets.route;
    const target = clamp01(f) * total;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] <= target) { ctx.lineTo(pts[i][0], pts[i][1]); continue; }
      const span = cum[i] - cum[i - 1] || 1;
      const p = (target - cum[i - 1]) / span;
      ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], p), lerp(pts[i - 1][1], pts[i][1], p));
      break;
    }
    ctx.stroke();
  }

  /* --------------------------- draw helpers ------------------------------ */

  function withAlpha(a, fn) {
    if (a <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = a;
    fn();
    ctx.restore();
  }

  function mono(size, weight = 400, spacing = 0) {
    ctx.font = `${weight} ${size}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
    ctx.letterSpacing = `${spacing}px`;
  }

  /** Reveals `text` character-by-character as p goes 0..1 (terminal type-on). */
  function typed(text, p) {
    return text.slice(0, Math.round(clamp01(p) * text.length));
  }

  /* -------------------------- footage plates -----------------------------
     Live footage enters the render as pre-extracted, pre-resampled frames
     (see plates.mjs): output frame N of a footage phase is plate N of that
     phase's directory, one JPEG per frame at a flat 30 fps. Nothing here has
     to know that the sources are 30000/1001.                                */

  const cache = new Map();     // insertion-ordered, so it evicts FIFO

  async function loadPlate(phase, idx) {
    const key = `${phase}/${String(idx).padStart(4, '0')}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const bmp = await createImageBitmap(await (await fetchOk(`${plateRoot}${key}.jpg`)).blob());
    cache.set(key, bmp);
    if (cache.size > plateCache) {
      const [oldest, old] = cache.entries().next().value;
      old.close?.();
      cache.delete(oldest);
    }
    return bmp;
  }

  /* ---------------------------- primitives ------------------------------- */

  /** The recoloured national map, optionally still growing into place. */
  function drawMap({ alpha, grow = 1 }) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(MAP.x + MAP.w / 2, MAP.y + MAP.h / 2);
    ctx.scale(grow, grow);
    ctx.translate(-(MAP.x + MAP.w / 2), -(MAP.y + MAP.h / 2));
    ctx.drawImage(assets.map, MAP.x, MAP.y, MAP.w, MAP.h);
    ctx.restore();
  }

  /**
   * The M-15 corridor traced to arc-length fraction f.
   *
   * `pulseT` drives the leading hot spot's shimmer; pass null for a corridor
   * that is simply present rather than being drawn.
   */
  function drawRoute({ f, fade, pulseT = null }) {
    if (f <= 0) return;

    withAlpha(fade * 0.35, () => {                    // outer bloom
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 14;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.filter = 'blur(7px)';
      strokeRoute(f);
    });
    withAlpha(fade, () => {                           // hot core
      ctx.strokeStyle = '#ffd9a8';
      ctx.lineWidth = 3.4;
      ctx.lineJoin = ctx.lineCap = 'round';
      strokeRoute(f);
    });

    // Leading pulse, only while the trace is still drawing.
    if (f < 1 && pulseT !== null) {
      const [px, py] = pointAt(f);
      withAlpha(fade, () => {
        const r = 7 + Math.sin(pulseT * 14) * 1.6;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3.4);
        g.addColorStop(0, '#fff4e2');
        g.addColorStop(0.35, ORANGE);
        g.addColorStop(1, rgba(ORANGE, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, r * 3.4, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  /**
   * The coverage raster, revealed inside a circle of radius `reveal` centred
   * on the site, plus the propagation rings that launch from it.
   *
   * @param rings progress values 0..1, one per ring; a ring outside (0,1) is
   *              simply not drawn, which is how they stagger
   */
  function drawCoverage({ alpha, reveal, rings = [] }) {
    if (alpha <= 0.001) return;
    const [sx, sy] = pointAt(SITE_T);

    // Stretch the raster so its covered-area bbox sits on the map's BiH outline.
    const box = assets.bih;
    if (box) {
      const src = assets.coverage;
      const fw = COVERAGE_BOX.x1 - COVERAGE_BOX.x0;
      const fh = COVERAGE_BOX.y1 - COVERAGE_BOX.y0;
      const dw = box.w / fw, dh = box.h / fh;
      const dx = box.x - COVERAGE_BOX.x0 * dw, dy = box.y - COVERAGE_BOX.y0 * dh;

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, reveal, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = alpha * 0.45;             // body fill
      ctx.drawImage(src, dx, dy, dw, dh);
      ctx.globalAlpha = alpha * 0.30;             // additive bloom on top
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(src, dx, dy, dw, dh);
      ctx.restore();
    }

    for (const p of rings) {
      if (p <= 0 || p >= 1) continue;
      withAlpha(alpha * (1 - p) * 0.8, () => {
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = lerp(4, 1, p);
        ctx.beginPath(); ctx.arc(sx, sy, easeOut(p) * 900, 0, Math.PI * 2); ctx.stroke();
      });
    }
  }

  /**
   * Scales the map layers about the site pixel, so a reticle drawn OUTSIDE
   * this transform stays put and stays crisp while the country blows up
   * underneath it.
   *
   * @param p 0 = national scale, 1 = fully pushed in. The intro runs it
   *          forward; the outro runs the same number backwards.
   */
  function withZoom({ p, zoomMax, blurMax }, fn) {
    if (p <= 0) { fn(); return; }
    const [sx, sy] = pointAt(SITE_T);
    const z = lerp(1, zoomMax, p);
    ctx.save();
    // Blur only over the back half, where detail runs out and the dissolve starts.
    const blur = blurMax * easeOut(ramp(p, 0.55, 1));
    if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.translate(sx, sy);
    ctx.scale(z, z);
    ctx.translate(-sx, -sy);
    fn();
    ctx.restore();
  }

  /** Scanlines + vignette + the dip to black, applied last. */
  function drawGlass({ scanlineAlpha, fade }) {
    ctx.save();
    ctx.globalAlpha = scanlineAlpha;
    ctx.fillStyle = '#7fe4ff';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.restore();

    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (fade > 0) { ctx.globalAlpha = fade; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  return {
    assets, pointAt, strokeRoute, withAlpha, mono, typed, loadPlate,
    drawMap, drawRoute, drawCoverage, withZoom, drawGlass,
  };
}
