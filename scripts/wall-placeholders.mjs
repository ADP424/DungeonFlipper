// Generates the built walls' autotile pieces in apps/client/art/walls/<wall>/, a folder per wall obstacle.
// Usage: node scripts/wall-placeholders.mjs [--force]   (existing images are kept unless --force)
// The backrooms walls are drawn by hand and aren't listed here; these follow their layout and masks.
//
// Each folder holds four 8×8 pieces, and a wallpaper mask next to each piece that has a face:
//   outer.png  outer corner   exposed (open) on the north and west sides
//   edge.png   edge           exposed on the north side; must tile horizontally with itself
//   inner.png  inner corner   only the north-west diagonal is open
//   fill.png   fully enclosed; drawn unturned, so it must tile with itself
//   <piece>_mask.png          pixels with alpha > 0 are where wallpaper replaces the face
// The other pieces are drawn as the top-left quarter of a tile; the game turns them into the other quarters.
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/client/art/walls');
const force = process.argv.includes('--force');

/**
 * Per material: `line` runs along both sides of the face, and `main` is the face (what shows without
 * wallpaper) and the enclosed top, with texture drawn over it. `face` is the texture of a face, six
 * rows from the open side inward, running along the wall (8 px, must tile); `fill` the texture of the
 * enclosed top (8×8, must tile). Texture letters index `tex`; '.' is `main`.
 */
const PLAIN = Array(8).fill('........');
const MATERIALS = {
  drywall: { line: 0xb0aca1, main: 0xe5e3dc, tex: {}, face: PLAIN, fill: PLAIN },
  concrete: {
    line: 0xb0aca1, main: 0x898f95, tex: { d: 0x656a6e, l: 0xacb3bb },
    face: [
      '..d.....',
      '.....l..',
      'l.....d.',
      '...d....',
      '.l......',
      '.....d.l',
    ],
    fill: [
      '.....l..',
      '.d......',
      '..l...d.',
      '....d...',
      '........',
      '..d....l',
      '...l.d..',
      'l.......',
    ],
  },
  timber: {
    line: 0x755036, main: 0x755036, tex: { m: 0x815e3e, h: 0xc18e5d },
    face: [
      '........',
      'mmmmmhhm',
      '........',
      '..mmmm..',
      'hmm...mm',
      '........',
    ],
    fill: [
      '........',
      'mmmmmhhm',
      '........',
      '..mmm...',
      'm.....mm',
      '........',
      'mmhhmm..',
      '........',
    ],
  },
};

/** Wall obstacle id → its material. Low and full-height walls share a look (and the backrooms masks). */
const WALLS = {
  concrete_wall: 'concrete', concrete_wall_short: 'concrete',
  timber_wall: 'timber', timber_wall_short: 'timber',
  drywall: 'drywall', drywall_short: 'drywall',
};

/**
 * What a pixel of a piece is, laid out as on the backrooms wall: 'line', the enclosed top
 * (`fill`), or face: `d` rows in from the open side (1–6) and `a` px along the wall.
 */
function role(piece, x, y) {
  if (piece === 'fill') return { fill: true };
  if (piece === 'edge') return y === 0 || y === 7 ? 'line' : { d: y, a: x };
  if (piece === 'outer') {
    if (x === 0 || y === 0 || (x === 7 && y === 7)) return 'line';
    return { d: Math.min(x, y), a: Math.max(x, y) };
  }
  // Inner corner: the neighbours' faces meet, and their lines turn the corner at its first pixel.
  if ((x === 0 && y === 0) || x === 7 || y === 7) return 'line';
  return { d: Math.max(x, y), a: Math.min(x, y) };
}

/** One piece's image and its wallpaper mask (null when the piece has no face), as PNGs. */
function images(piece, m) {
  const S = 8;
  const art = new Uint8Array(S * S * 4), mask = new Uint8Array(S * S * 4);
  const set = (px, x, y, c) => {
    const i = (y * S + x) * 4;
    px[i] = (c >> 16) & 255; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255; px[i + 3] = 255;
  };
  const tex = (ch) => m.tex[ch] ?? m.main;
  let faced = false;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = role(piece, x, y);
      if (r === 'line') { set(art, x, y, m.line); continue; }
      if (r.fill) { set(art, x, y, tex(m.fill[y][x])); continue; }
      set(art, x, y, tex(m.face[r.d - 1][r.a]));
      set(mask, x, y, 0xffffff);
      faced = true;
    }
  }
  return { art: png(S, S, art), mask: faced ? png(S, S, mask) : null };
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

function write(file, data) {
  if (existsSync(file) && !force) { console.log(`keep  ${file}`); return; }
  writeFileSync(file, data);
  console.log(`wrote ${file}`);
}

for (const [wall, material] of Object.entries(WALLS)) {
  mkdirSync(join(OUT, wall), { recursive: true });
  for (const piece of ['outer', 'edge', 'inner', 'fill']) {
    const { art, mask } = images(piece, MATERIALS[material]);
    write(join(OUT, wall, `${piece}.png`), art);
    if (mask) write(join(OUT, wall, `${piece}_mask.png`), mask);
  }
}
