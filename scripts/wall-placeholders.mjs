// Generates the built walls' autotile pieces in apps/client/art/walls/<wall>/, a folder per wall obstacle.
// Usage: node scripts/wall-placeholders.mjs [--force]   (existing images are kept unless --force)
// The backrooms walls are drawn by hand and aren't listed here; these follow their layout and masks.
//
// The world is seen from the south, tilted back: a wall shows its top, and below it its face where it's
// open to the south. Each folder holds five 16×16 pieces, each a whole tile whose four quarters are that
// piece's four corners (the game takes a quarter at a time), and a wallpaper mask next to each with a face:
//   outer.png       a lone pillar: open on every side
//   horizontal.png  a wall running east–west: open to the north and south; must tile horizontally
//   vertical.png    a wall running north–south: open to the west and east; must tile vertically
//   inner.png       a cross junction: only the diagonals are open
//   fill.png        fully enclosed: the wall's top; must tile with itself
//   <piece>_mask.png  pixels with alpha > 0 are where wallpaper replaces the face
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/client/art/walls');
const force = process.argv.includes('--force');

/**
 * Per material: `line` outlines the wall's top and runs along both sides of its face, and `main` is the
 * face (what shows without wallpaper) and the top, with texture drawn over it. `face` is the texture of
 * a face, from the wall's top down (repeating), running along the wall (8 px, must tile); `fill` the
 * texture of the top (8×8, must tile). Texture letters index `tex`; '.' is `main`.
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

/**
 * How a wall of each height is drawn: its face's rows (between a line under the top and one along the
 * floor), the clear rows above its top where it's open to the north (a low wall's top is that much
 * lower), and how its top is shaded from the material's colours: a full-height wall's is above the
 * lights, a low wall's is lit from above.
 */
const TALL = { face: 9, gap: 0, top: 0.7 }, SHORT = { face: 5, gap: 4, top: 1.1 };

/** Wall obstacle id → its material and height. */
const WALLS = {
  concrete_wall: ['concrete', TALL], concrete_wall_short: ['concrete', SHORT],
  timber_wall: ['timber', TALL], timber_wall_short: ['timber', SHORT],
  drywall: ['drywall', TALL], drywall_short: ['drywall', SHORT],
};

const S = 16;

/**
 * What a pixel of a piece is, laid out as on the backrooms walls: 'line', 'top', nothing (null, above
 * a low wall's top), or face, `d` rows below the line under the top (0…).
 */
function role(piece, x, y, height) {
  if (piece === 'fill') return 'top';
  const side = x === 0 || x === S - 1, lip = S - 2 - height.face;
  if (piece === 'vertical') return side ? 'line' : 'top';
  // Inner corners: the neighbours' lines meet at the corner pixel, and beside the lower two a
  // neighbour's face ends.
  if (piece === 'inner') return side && (y === 0 || y >= lip) ? 'line' : 'top';
  if (y < height.gap) return null;
  if (y === height.gap || y === lip || y === S - 1 || (piece === 'outer' && side)) return 'line';
  return y > lip ? { d: y - lip - 1 } : 'top';
}

const shade = (c, f) => [16, 8, 0].reduce((out, s) => out | (Math.min(255, Math.round(((c >> s) & 255) * f)) << s), 0);

/** One piece's image and its wallpaper mask (null when the piece has no face), as PNGs. */
function images(piece, m, height) {
  const art = new Uint8Array(S * S * 4), mask = new Uint8Array(S * S * 4);
  const set = (px, x, y, c) => {
    const i = (y * S + x) * 4;
    px[i] = (c >> 16) & 255; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255; px[i + 3] = 255;
  };
  const tex = (ch) => m.tex[ch] ?? m.main;
  let faced = false;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = role(piece, x, y, height);
      if (!r) continue;
      if (r === 'line') { set(art, x, y, m.line); continue; }
      if (r === 'top') { set(art, x, y, shade(tex(m.fill[y % 8][x % 8]), height.top)); continue; }
      set(art, x, y, tex(m.face[r.d % m.face.length][x % 8]));
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

for (const [wall, [material, height]] of Object.entries(WALLS)) {
  mkdirSync(join(OUT, wall), { recursive: true });
  for (const piece of ['outer', 'horizontal', 'vertical', 'inner', 'fill']) {
    const { art, mask } = images(piece, MATERIALS[material], height);
    write(join(OUT, wall, `${piece}.png`), art);
    if (mask) write(join(OUT, wall, `${piece}_mask.png`), mask);
  }
}
