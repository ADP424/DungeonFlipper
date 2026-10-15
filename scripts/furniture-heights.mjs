// Starts off furniture height maps (apps/client/art/furniture/<piece>/<view>_height.png), and draws the
// swatches to paint them with (docs/height-swatches.png).
// Usage: node scripts/furniture-heights.mjs [--force]   (existing maps are kept unless --force)
//
// A height map is the same size as its view's art, painted in flat colours (read by `heightMap` in
// apps/client/src/engine/assets.ts, which this must match):
//   green  a top-facing surface: FLOOR + STEP × its height in pixels above the floor
//   blue   a front face: FLOOR + STEP × the height of its foot; the game climbs it a pixel per row
// A started map is a guess from the art's outline: in each column, a front face up from the lowest pixel
// as far as the piece's height, standing on the floor, and a top at that height above it. Paint over it.
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'apps/client/art/furniture');
const force = process.argv.includes('--force');

const FLOOR = 60, STEP = 6;
/** The highest height a channel can hold. */
const MAX = Math.floor((255 - FLOOR) / STEP);
const top = (height) => [0, FLOOR + STEP * height, 0, 255];
const front = (height) => [0, 0, FLOOR + STEP * height, 255];

/** Pieces to start a map for → their height in pixels (16 to a tile). */
const PIECES = { bed: 8, chair: 10, desk_lamp: 16, double_bed: 8, dresser: 12 };

function started(art, height) {
  const { w, h, px } = art;
  const out = new Uint8Array(w * h * 4);
  for (let x = 0; x < w; x++) {
    let foot = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (px[(y * w + x) * 4 + 3] <= 40) continue;
      if (foot < 0) foot = y;
      out.set(foot - y < height ? front(0) : top(height), (y * w + x) * 4);
    }
  }
  return png(w, h, out);
}

/**
 * The swatches: tops along the upper row and front faces along the lower, 8 px each, from 0 at the left
 * to MAX. The ruler underneath has a tick at every 4 and a longer one at every 8.
 */
function swatches() {
  const S = 8, w = (MAX + 1) * S, h = S * 2 + 4;
  const out = new Uint8Array(w * h * 4);
  for (let n = 0; n <= MAX; n++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < S; x++) {
        const tick = x === 0 && n % 4 === 0 && y - S * 2 < (n % 8 === 0 ? 4 : 2);
        const c = y < S ? top(n) : y < S * 2 ? front(n) : tick ? [255, 255, 255, 255] : [0, 0, 0, 255];
        out.set(c, (y * w + n * S + x) * 4);
      }
    }
  }
  return png(w, h, out);
}

function write(file, data) {
  if (existsSync(file) && !force) { console.log(`keep  ${file}`); return; }
  writeFileSync(file, data);
  console.log(`wrote ${file}`);
}

for (const [piece, height] of Object.entries(PIECES)) {
  for (const view of ['south', 'north', 'side']) {
    const art = join(ART, piece, `${view}.png`);
    if (existsSync(art)) write(join(ART, piece, `${view}_height.png`), started(readPng(readFileSync(art)), height));
  }
}
writeFileSync(join(ROOT, 'docs/height-swatches.png'), swatches());

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
