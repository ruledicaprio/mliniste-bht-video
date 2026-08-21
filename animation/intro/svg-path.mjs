// SVG path data -> polyline points.
//
// Only what the M-15 corridor markup actually needs, but correct for it: the
// previous version consumed two numbers per step regardless of command, which
// silently desynced on H/V (one number each) and turned Bezier control points
// into route vertices. That happened to produce the right answer for the
// current SVG — three pure relative-`m` polylines — and would have quietly
// corrupted the route on any re-export from Inkscape.

/** Numbers in path data: optional sign, optional decimal, optional exponent. */
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const TOKENS = new RegExp(`${NUM}|[A-Za-z]`, 'g');

/** Parameters consumed per repetition of each command. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };

/** After an explicit moveto, further coordinate pairs are implicit linetos. */
const IMPLICIT = { M: 'L', m: 'l' };

/** Samples per curve when flattening. 16 is well under one screen pixel at map scale. */
const CURVE_STEPS = 16;

const round = (v) => Number(v.toFixed(2));

function cubicAt(p0, p1, p2, p3, s) {
  const u = 1 - s;
  return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3;
}

function quadAt(p0, p1, p2, s) {
  const u = 1 - s;
  return u * u * p0 + 2 * u * s * p1 + s * s * p2;
}

/**
 * Converts one `d` attribute into `[[x, y], ...]` in user units.
 *
 * Curves are flattened to line segments; arcs are rejected rather than
 * approximated, because a wrong route is worse than a loud failure.
 */
export function pathToPoints(d) {
  const toks = String(d).match(TOKENS) ?? [];
  const out = [];

  let x = 0, y = 0;            // current point
  let startX = 0, startY = 0;  // current subpath start, for Z
  let lastCtrlX = 0, lastCtrlY = 0; // previous curve's 2nd control point, for S/T
  let lastCmd = '';
  let cmd = null;

  const push = (px, py) => {
    const p = [round(px), round(py)];
    const prev = out[out.length - 1];
    // Collapse exact repeats (a Z back onto the start, a zero-length segment).
    if (prev && prev[0] === p[0] && prev[1] === p[1]) return;
    out.push(p);
  };

  for (let i = 0; i < toks.length;) {
    if (/^[A-Za-z]$/.test(toks[i])) {
      cmd = toks[i++];
    } else if (cmd === null) {
      throw new Error('path data starts with a number, expected a command');
    }

    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;

    if (upper === 'A') {
      throw new Error(
        'elliptical arc (A/a) in path data is not supported — flatten arcs to ' +
        'lines or curves in the editor before exporting'
      );
    }
    if (!(upper in ARITY)) {
      throw new Error(`unsupported path command: ${cmd}`);
    }

    const n = ARITY[upper];

    if (upper === 'Z') {
      push(startX, startY);
      x = startX; y = startY;
      lastCmd = upper;
      continue;
    }

    if (i + n > toks.length) {
      throw new Error(`truncated path data: ${cmd} needs ${n} parameter(s), found ${toks.length - i}`);
    }
    const a = toks.slice(i, i + n).map(Number);
    if (a.some(Number.isNaN)) throw new Error(`non-numeric parameter for ${cmd}`);
    i += n;

    switch (upper) {
      case 'M': {
        x = rel ? x + a[0] : a[0];
        y = rel ? y + a[1] : a[1];
        startX = x; startY = y;
        push(x, y);
        // Subsequent pairs without a new command letter are linetos.
        cmd = IMPLICIT[cmd] ?? cmd;
        break;
      }
      case 'L': {
        x = rel ? x + a[0] : a[0];
        y = rel ? y + a[1] : a[1];
        push(x, y);
        break;
      }
      case 'H': {
        x = rel ? x + a[0] : a[0];
        push(x, y);
        break;
      }
      case 'V': {
        y = rel ? y + a[0] : a[0];
        push(x, y);
        break;
      }
      case 'C':
      case 'S': {
        let c1x, c1y, c2x, c2y, ex, ey;
        if (upper === 'C') {
          [c1x, c1y, c2x, c2y, ex, ey] = rel
            ? [x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]]
            : a;
        } else {
          // S reflects the previous cubic's second control point about the current point.
          const smooth = lastCmd === 'C' || lastCmd === 'S';
          c1x = smooth ? 2 * x - lastCtrlX : x;
          c1y = smooth ? 2 * y - lastCtrlY : y;
          [c2x, c2y, ex, ey] = rel ? [x + a[0], y + a[1], x + a[2], y + a[3]] : a;
        }
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const u = s / CURVE_STEPS;
          push(cubicAt(x, c1x, c2x, ex, u), cubicAt(y, c1y, c2y, ey, u));
        }
        lastCtrlX = c2x; lastCtrlY = c2y;
        x = ex; y = ey;
        break;
      }
      case 'Q':
      case 'T': {
        let cx, cy, ex, ey;
        if (upper === 'Q') {
          [cx, cy, ex, ey] = rel ? [x + a[0], y + a[1], x + a[2], y + a[3]] : a;
        } else {
          const smooth = lastCmd === 'Q' || lastCmd === 'T';
          cx = smooth ? 2 * x - lastCtrlX : x;
          cy = smooth ? 2 * y - lastCtrlY : y;
          [ex, ey] = rel ? [x + a[0], y + a[1]] : a;
        }
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const u = s / CURVE_STEPS;
          push(quadAt(x, cx, ex, u), quadAt(y, cy, ey, u));
        }
        lastCtrlX = cx; lastCtrlY = cy;
        x = ex; y = ey;
        break;
      }
    }

    lastCmd = upper;
  }

  return out;
}
