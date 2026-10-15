// Generates placeholder art for enemies: their animation frames (derived from each one's idle art),
// what they hold, and the projectiles and puddles they leave.
// Usage: node scripts/enemy-placeholders.mjs [--force]   (existing images are kept unless --force)
//
// An enemy's art is a folder, art/enemies/<id>/ (bosses: art/bosses/<id>/):
//   idle.png          its resting art (drawn by hand; this script never writes it), or idle/0.png… if it moves
//   <anim>/0.png…     the frames of each animation its def names in `anims` (windup, stunned, call…)
//   held.png          what it holds, drawn pointing up and gripped at its bottom centre
// One with `views` in its def is drawn by hand throughout, a drawing per view (idle/<view>.png, <anim>/<view>/0.png…).
// Replace any generated file with real art; the game only looks at the file names.
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../apps/client/art');
const force = process.argv.includes('--force');

// ───────────────────────────── animations ─────────────────────────────

/**
 * How each animation's frames are made from the idle art, one entry per frame:
 *   squash  px the figure crouches by (it stays standing on the same spot)
 *   lean    px its top half shifts sideways
 *   shift   px the whole figure shifts sideways
 *   tint    [colour, amount 0–1] it's washed toward
 * Different enemies wind up differently, with different numbers of frames.
 */
const RED = 0xff7060, WHITE = 0xffffff, BLUE = 0x80c0ff;
const ANIMS = {
  'enemies/damp_blob': { windup: [{ squash: 1 }, { squash: 3 }, { squash: 5, tint: [BLUE, 0.2] }] },
  'enemies/intern': { windup: [{ lean: -1 }, { lean: -1, squash: 1, tint: [RED, 0.2] }] },
  'enemies/water_cooler': { windup: [{ squash: 1 }, { squash: 2, tint: [BLUE, 0.25] }, { lean: 1, tint: [BLUE, 0.35] }] },
  'enemies/flicker': { windup: [{ tint: [WHITE, 0.6] }, { tint: [WHITE, 0.3] }, { tint: [WHITE, 0.6] }, { tint: [WHITE, 0.15] }] },
  'enemies/stapler_clerk': { windup: [{ lean: 1 }, { lean: 1, tint: [RED, 0.2] }] },
  'enemies/hr_rep': { windup: [{ lean: -1 }, { lean: -2 }, { lean: 1, tint: [RED, 0.2] }] },
  'enemies/security_guard': {
    windup: [{ squash: 1 }, { squash: 2 }, { squash: 2, lean: 1, tint: [RED, 0.2] }],
    stunned: [{ shift: -1, tint: [WHITE, 0.2] }, { shift: 1, tint: [WHITE, 0.2] }],
  },
  'enemies/thug': { windup: [{ lean: -1 }, { lean: -2, squash: 1 }, { lean: -2, squash: 1, tint: [RED, 0.25] }] },
  'enemies/realtor': { call: [{ lean: 1 }, { lean: 1, squash: 1 }] },
  'enemies/realtor_guard': { windup: [{ squash: 1 }, { squash: 1, tint: [BLUE, 0.3] }] },
  'bosses/facility_manager': { windup: [{ squash: 1 }, { squash: 3 }, { squash: 4, tint: [RED, 0.15] }, { squash: 4, tint: [RED, 0.3] }] },
};

function frame(src, { squash = 0, lean = 0, shift = 0, tint }) {
  const { w, h, px } = src;
  const out = new Uint8Array(w * h * 4);
  for (let y = squash; y < h; y++) {
    // Crouching squeezes the figure into the rows that are left, feet where they were.
    const sy = Math.round(((y - squash) * (h - 1)) / Math.max(1, h - 1 - squash));
    const dx = shift + (y < h / 2 ? lean : 0);
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4, d = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = px[s + c];
      if (tint) {
        const [colour, amount] = tint;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(px[s + c] + (((colour >> (16 - c * 8)) & 255) - px[s + c]) * amount);
      }
    }
  }
  return png(w, h, out);
}

// ───────────────────────────── drawn pieces ─────────────────────────────

/** Small images drawn here pixel by pixel: rows of palette letters ('.' is clear). */
const PALETTE = {
  s: 0x8a97a8, S: 0xc8d2de, d: 0x4c5664, // steel: mid, light, dark
  k: 0x23252b, K: 0x3c4048, // black plastic
  w: 0x9a6a3c, W: 0xc08e58, // wood
  r: 0xc23a34, y: 0xe8c840, b: 0x3a78d8, B: 0x8cc4f4, p: 0xf2f2f2, g: 0x6a6f78,
};
const DRAWN = {
  // Held things point up and are gripped at the bottom centre.
  'enemies/security_guard/held': ['dSSSSSSSSSSd', 'dsssSSSSsssd', 'dssssssssssd', '.dddddddddd.'],
  'enemies/thug/held': ['.WW.', 'WWWw', 'WWWw', 'WWWw', 'WWWw', '.Ww.', '.Ww.', '.Ww.', '.Ww.', '.kk.', '.kk.'],
  'enemies/realtor_guard/held': ['.yy.', 'kKKk', 'kKKk', 'kKKk', '.kk.', '.kk.', '.kk.'],
  'enemies/stapler_clerk/held': ['.rrrrr.', 'rrrrrrr', 'sSSSSSs', 'kkkkkkk'],
  'enemies/hr_rep/held': ['.b.', '.b.', '.b.', '.b.', '.b.', '.s.'],
  'enemies/realtor/held': ['kkkk', 'kBBk', 'kBBk', 'kBBk', 'kKKk', 'kkkk'],
  // Projectiles are 16×16 with the thing in the middle, pointing right.
  'projectiles/droplet': centred(['.BB.', 'BbbB', 'BbbB', '.BB.']),
  'projectiles/pen': centred(['sbbbbbbk', 'sbbbbbbk']),
  'projectiles/thrown_stapler': centred(['.rrrrr.', 'rrrrrrr', 'sSSSSSs', 'kkkkkkk']),
  'projectiles/taser_dart': centred(['BByyyys', 'BByyyys']),
};

/** Put a small drawing in the middle of a 16×16 image. */
function centred(rows, size = 16) {
  const w = rows[0].length, h = rows.length;
  const left = Math.floor((size - w) / 2), top = Math.floor((size - h) / 2);
  return Array.from({ length: size }, (_, y) => {
    const row = rows[y - top];
    return '.'.repeat(left) + (row ?? '.'.repeat(w)) + '.'.repeat(size - left - w);
  });
}

function drawn(rows) {
  const w = rows[0].length, h = rows.length;
  const px = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = PALETTE[row[x]];
      if (c === undefined) continue;
      px.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], (y * w + x) * 4);
    }
  });
  return png(w, h, px);
}

/** A puddle: a flat, see-through blot a little wider than it's tall, with a lighter rim. */
function puddle(size = 28) {
  const px = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wobble = 1 + 0.08 * Math.sin(Math.atan2(y - c, x - c) * 5);
      const d = Math.hypot((x - c) / c, (y - c) / (c * 0.8)) / wobble;
      if (d > 1) continue;
      const rim = d > 0.82;
      px.set(rim ? [0x8c, 0xc4, 0xf4, 150] : [0x3a, 0x78, 0xd8, 105], (y * size + x) * 4);
    }
  }
  return png(size, size, px);
}

// ───────────────────────────── output ─────────────────────────────

let written = 0, kept = 0;
function write(key, data) {
  const file = join(ART, `${key}.png`);
  if (existsSync(file) && !force) { kept++; return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  written++;
}

for (const [folder, anims] of Object.entries(ANIMS)) {
  const idle = join(ART, folder, 'idle.png');
  if (!existsSync(idle)) { console.warn(`no ${folder}/idle.png: skipped its animations`); continue; }
  const src = readPng(readFileSync(idle));
  for (const [name, frames] of Object.entries(anims)) frames.forEach((f, i) => write(`${folder}/${name}/${i}`, frame(src, f)));
}
for (const [key, rows] of Object.entries(DRAWN)) write(key, drawn(rows));
write('fx/puddle', puddle());
console.log(`${written} written, ${kept} kept${kept ? ' (use --force to redraw them)' : ''}`);

// ───────────────────────────── PNG ─────────────────────────────

/** Decode an 8-bit RGBA, non-interlaced PNG (what the art files are). */
function readPng(buf) {
  let at = 8, w = 0, h = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('only 8-bit RGBA, non-interlaced PNGs are supported');
    } else if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, px = new Uint8Array(stride * h);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? px[y * stride + i - 4] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = i >= 4 && y ? px[(y - 1) * stride + i - 4] : 0;
      px[y * stride + i] = (v + [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
    }
  }
  return { w, h, px };
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
