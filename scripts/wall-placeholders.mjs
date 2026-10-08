// Generates placeholder wall autotile piece sheets in apps/client/public/assets/walls/.
// Usage: node scripts/wall-placeholders.mjs [--force]   (existing sheets are kept unless --force)
//
// Sheet layout (32×16 px): row 0 holds four 8×8 pieces, row 1 their wallpaper masks.
//   x 0  outer corner   exposed (open) on the north and west sides
//   x 8  edge           exposed on the north side; must tile horizontally with itself
//   x 16 inner corner   only the north-west diagonal is open
//   x 24 fill           fully enclosed
// Every piece is drawn as the top-left quarter of a tile; the game rotates it into the other quarters.
// Mask pixels with alpha > 0 are where wallpaper replaces the face.
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/client/public/assets/walls');
const force = process.argv.includes('--force');

const MATERIALS = {
  stone: { cap: 0x4a5060, face: 0x8a93a6, hi: 0xb4bccb, line: 0x2a2e38, grain: 0x5a6273 },
  wood: { cap: 0x5a3a20, face: 0x9a6a3c, hi: 0xc08a54, line: 0x2e1c0e, grain: 0x6a4424 },
  plaster: { cap: 0x8e8574, face: 0xd8cfbf, hi: 0xf0e9dc, line: 0x5a5244, grain: 0xa89e8c },
};

/** Pixel role at (x, y) of a piece, given the face depth (outline + face rows). */
function role(piece, x, y, depth) {
  const band = (d) => (d === 0 ? 'line' : d < depth ? 'face' : d === depth ? 'hi' : null);
  if (piece === 'edge') return band(y) ?? 'cap';
  if (piece === 'outer') {
    const r = band(Math.min(x, y));
    return r ?? 'cap';
  }
  if (piece === 'inner') {
    // A small mitred corner where the neighbours' faces meet; no outline (it would cut their faces).
    if (x <= depth && y <= depth) return x === depth || y === depth ? 'hi' : 'face';
    return 'cap';
  }
  return 'cap';
}

function sheet(m, short) {
  const W = 32, H = 16;
  const px = new Uint8Array(W * H * 4);
  const set = (x, y, c, a = 255) => {
    const i = (y * W + x) * 4;
    px[i] = (c >> 16) & 255; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255; px[i + 3] = a;
  };
  // Faces are deep enough to show shadows climbing them; low walls are shallower, with a lighter cap.
  const depth = short ? 3 : 6;
  const cap = short ? m.grain : m.cap;
  ['outer', 'edge', 'inner', 'fill'].forEach((piece, n) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const r = role(piece, x, y, depth);
        let c = r === 'cap' ? cap : m[r];
        // Sparse grain on the cap so tiled walls read as material, kept away from piece borders.
        if (r === 'cap' && ((x * 7 + y * 3) % 11 === 0) && x > 0 && y > 0) c = short ? m.cap : m.grain;
        set(n * 8 + x, y, c);
        if (r === 'face') set(n * 8 + x, 8 + y, 0xffffff);
      }
    }
  });
  return png(W, H, px);
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
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

mkdirSync(OUT, { recursive: true });
for (const [name, m] of Object.entries(MATERIALS)) {
  for (const short of [false, true]) {
    const file = join(OUT, `${name}${short ? '_short' : ''}.png`);
    if (existsSync(file) && !force) { console.log(`keep  ${file}`); continue; }
    writeFileSync(file, sheet(m, short));
    console.log(`wrote ${file}`);
  }
}
