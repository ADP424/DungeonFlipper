import { Rectangle, Texture, TextureStyle } from 'pixi.js';
import { registry, showsFace, viewNames, wallQuarters, type SurfaceDef, type WallPiece } from '@df/shared';

/**
 * Key-based texture registry. Game code only ever refers to sprite keys:
 *   <path>               a PNG under apps/client/art/, without the extension ('furniture/sofa'). A folder
 *                        of numbered PNGs is an animation: its frames are '<path>/0', '<path>/1'… (see
 *                        `frameKeys`), and the folder's own key is its first frame.
 *   wall:<surfaceId>     a tall wall face covered in that wallpaper
 *   wallshort:<surfaceId> a short wall covered in that wallpaper
 *   auto:<set>:<mask>[:<surfaceId>]  an autotiled wall tile (see world/autotile.ts), composed from
 *                        the pieces in art/walls/<set>/, optionally wallpapered
 *   autogeo:<set>:<mask>:<base>  the same tile's geometry for lighting and shadows (see drawAutotileGeometry)
 * Swapping art means editing the PNGs, never game code.
 *
 * A PNG named `<art>_height` next to a piece of art is its height map (see `heightMap`), not a sprite.
 *
 * Every PNG under art/ is packed into one atlas texture at startup, so the whole game draws from a
 * single GPU texture (sprites batch into few draw calls). Vite bundles the files themselves: adding,
 * removing or editing one reloads the page in dev.
 */
const ART_FILES = import.meta.glob('../../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ART_PREFIX = '../../art/';
/** Transparent gap around each packed sprite, so rotated or scaled sprites never sample a neighbour. */
const PAD = 2;
const ATLAS_W = 1024;

interface Region { x: number; y: number; w: number; h: number }
let atlasCanvas: HTMLCanvasElement | null = null;
let atlasTexture: Texture | null = null;
const regions = new Map<string, Region>();
/** Animation folder → its frame keys in order. */
const animations = new Map<string, string[]>();

const cache = new Map<string, Texture>();
const canvasCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

/**
 * Wall art, a folder per set (art/walls/<set>/): the pieces outer / horizontal / vertical / inner /
 * fill, each drawn as a whole 16×16 tile showing the piece in all four quarters (see world/autotile.ts),
 * and next to each an optional wallpaper mask (<piece>_mask). Placeholders come from
 * scripts/wall-placeholders.mjs.
 */
const WALL_PIECES: WallPiece[] = ['outer', 'horizontal', 'vertical', 'inner', 'fill'];
const wallPiece = (set: string, piece: WallPiece, mask = false) => regions.get(`walls/${set}/${piece}${mask ? '_mask' : ''}`);

export async function loadAssets(): Promise<void> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const entries = await Promise.all(Object.entries(ART_FILES).map(async ([file, url]) => {
    const key = file.slice(ART_PREFIX.length, -'.png'.length);
    return { key, image: await loadImage(url) };
  }));
  packAtlas(entries);
  for (const set of new Set(registry.obstacles.all().flatMap((o) => (o.autotile ? [o.autotile.set] : [])))) {
    const lacking = WALL_PIECES.filter((p) => !wallPiece(set, p));
    if (lacking.length) console.warn(`[assets] wall set art/walls/${set}/ is missing ${lacking.join(', ')}`);
  }
  for (const s of registry.surfaces.all()) {
    if (!hasArt(s.sprite)) console.error(`[assets] surface '${s.id}' has no art/${s.sprite}.png`);
  }
  checkFurnitureArt();
  checkEnemyArt();
}

/** Every enemy needs its idle art and the frames of each animation it names (in each of its views, if it has them), and whatever it holds. */
function checkEnemyArt(): void {
  for (const def of registry.enemies.all()) {
    const body = [def.sprite, ...Object.values(def.anims ?? {}).map((a) => a.frames)];
    const keys = [...(def.views ? viewNames(def.views).flatMap((view) => body.map((key) => `${key}/${view}`)) : body), ...(def.held ? [def.held.sprite] : [])];
    for (const key of keys) if (!hasArt(key)) console.error(`[assets] enemy '${def.id}' has no art/${key}.png (or frames ${key}/0.png…)`);
  }
}

/** Every piece needs a south view; north and side are drawn case by case (a missing one uses south). */
function checkFurnitureArt(): void {
  for (const def of registry.furniture.all()) {
    if (!hasArt(`${def.sprite}/south`)) console.error(`[assets] furniture '${def.id}' has no art/${def.sprite}/south.png`);
    for (const view of ['south', 'north', 'side']) heightMap(`${def.sprite}/${view}`);
  }
}

/** Shelf-pack every image (tallest first) into one canvas, and index frames of animation folders. */
function packAtlas(entries: { key: string; image: HTMLImageElement }[]): void {
  entries.sort((a, b) => b.image.height - a.image.height || a.key.localeCompare(b.key));
  let x = 0, y = 0, shelf = 0;
  for (const { key, image } of entries) {
    const w = image.width + PAD * 2, h = image.height + PAD * 2;
    if (x + w > ATLAS_W) { x = 0; y += shelf; shelf = 0; }
    regions.set(key, { x: x + PAD, y: y + PAD, w: image.width, h: image.height });
    x += w;
    shelf = Math.max(shelf, h);
  }
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = Math.max(1, y + shelf);
  const ctx = c.getContext('2d')!;
  for (const { key, image } of entries) {
    const r = regions.get(key)!;
    ctx.drawImage(image, r.x, r.y);
  }
  atlasCanvas = c;
  atlasTexture = Texture.from(c);
  atlasTexture.source.scaleMode = 'nearest';

  // 'player/walk/0', 'player/walk/1'… make the animation 'player/walk'.
  for (const key of regions.keys()) {
    const m = /^(.*)\/(\d+)$/.exec(key);
    if (!m) continue;
    const frames = animations.get(m[1]!) ?? [];
    frames.push(key);
    animations.set(m[1]!, frames);
  }
  for (const frames of animations.values()) frames.sort((a, b) => frameNo(a) - frameNo(b));
}

const frameNo = (key: string) => Number(key.slice(key.lastIndexOf('/') + 1));

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** An art key's place in the atlas (an animation's key resolves to its first frame). */
function region(key: string): Region | undefined {
  return regions.get(key) ?? regions.get(animations.get(key)?.[0] ?? '');
}

/** The frame keys of an animation folder, in order; a single image is a one-frame animation. */
export function frameKeys(key: string): string[] {
  return animations.get(key) ?? [key];
}

/** Whether a key has art (a PNG or an animation folder). */
export function hasArt(key: string): boolean {
  return !!region(key);
}

/** Draw the source for a key onto a fresh canvas (16×16, or the art's own size). */
export function canvasFor(key: string): HTMLCanvasElement {
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const r = key.includes(':') ? undefined : region(key);
  if (r) {
    c.width = r.w;
    c.height = r.h;
  }
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const [prefix, name, arg] = key.split(':') as [string, string, string | undefined];
  if (r) {
    ctx.drawImage(atlasCanvas!, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  } else if (prefix === 'auto') {
    drawAutotile(ctx, name, Number(arg), key.split(':')[3]);
  } else if (prefix === 'autogeo') {
    drawAutotileGeometry(ctx, name, Number(arg), Number(key.split(':')[3] ?? 0));
  } else if (prefix === 'wall' || prefix === 'wallshort') {
    const s = registry.surfaces.tryGet(name);
    if (s) drawSurface(ctx, prefix, s);
    else missing(ctx);
  } else {
    if (!key.includes(':')) console.warn(`[assets] no art for '${key}' (expected apps/client/art/${key}.png)`);
    missing(ctx);
  }
  canvasCache.set(key, c);
  return c;
}

function drawSurface(ctx: CanvasRenderingContext2D, prefix: string, s: SurfaceDef) {
  const paper = canvasFor(s.sprite);
  if (prefix === 'wall') {
    ctx.drawImage(paper, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, 16, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 13, 16, 3);
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(0, 14, 16, 2);
    return;
  }
  // Short wall: only the lower block is papered.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 4, 16, 11); ctx.clip();
  ctx.drawImage(paper, 0, 0);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 4, 16, 2);
  ctx.fillStyle = '#5a3a24'; ctx.fillRect(0, 13, 16, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(1, 15, 15, 1);
}

/**
 * Where a tile's quarter (TL, TR, BR, BL) is in it, px. The upper two are the wall's north edge and the
 * lower two its south edge, with its face where that's open: they meet at the set's `faceLine`, so a
 * face may be any height.
 */
function quarterAt(q: number, set: string) {
  const split = faceLine(set);
  return { x: q === 1 || q === 2 ? 8 : 0, y: q >= 2 ? split : 0, w: 8, h: q >= 2 ? 16 - split : split };
}

/** Compose a wall tile (or, with `paperMask`, its wallpaper mask; a piece without one takes no paper) from each quarter's piece. */
function drawPieces(target: CanvasRenderingContext2D, set: string, pieces: WallPiece[], paperMask: boolean) {
  pieces.forEach((piece, q) => {
    const r = wallPiece(set, piece, paperMask);
    const { x, y, w, h } = quarterAt(q, set);
    if (r) target.drawImage(atlasCanvas!, r.x + x, r.y + y, w, h, x, y, w, h);
  });
}

/** Compose a wall tile from its four quarter pieces, then lay wallpaper over the face mask. */
function drawAutotile(ctx: CanvasRenderingContext2D, set: string, mask: number, surface?: string) {
  if (!WALL_PIECES.every((p) => wallPiece(set, p))) return missing(ctx);
  const pieces = wallQuarters(mask);
  drawPieces(ctx, set, pieces, false);
  const s = surface ? registry.surfaces.tryGet(surface) : undefined;
  if (!s) return;
  const paper = document.createElement('canvas');
  paper.width = paper.height = 16;
  const p = paper.getContext('2d')!;
  p.imageSmoothingEnabled = false;
  drawPieces(p, set, pieces, true);
  p.globalCompositeOperation = 'source-in';
  p.drawImage(canvasFor(s.sprite), 0, 0);
  ctx.drawImage(paper, 0, 0);
}

/**
 * How tall a wall set's face is drawn, in pixels: from the tile's bottom edge up to the wall's top,
 * read from the horizontal piece's wallpaper mask (the row above its topmost masked one is the top).
 */
const faceDepthCache = new Map<string, number>();
function faceDepth(set: string): number {
  let d = faceDepthCache.get(set);
  if (d !== undefined) return d;
  d = 4;
  const r = wallPiece(set, 'horizontal', true);
  if (r) {
    const a = atlasCanvas!.getContext('2d')!.getImageData(r.x, r.y, 1, 16).data;
    const top = Array.from({ length: 16 }, (_, y) => y).find((y) => a[y * 4 + 3]! > 0);
    if (top !== undefined) d = 16 - top;
  }
  faceDepthCache.set(set, d);
  return d;
}

/** The row of a wall set's tiles where its top ends and its face begins: the line drawn over the face. */
const faceLine = (set: string) => 16 - faceDepth(set) - 1;

/** Offsets in shadow geometry are stored in steps of this many pixels either side of 128 (so up to ±63 px). */
export const GEOMETRY_OFFSET_STEP = 0.5;

/** Which way a pixel of geometry faces, stored in green: 128 for up (floors, tops), 255 for south (front faces). */
export const facingGreen = (south: boolean) => (south ? 255 : 128);

/**
 * One pixel of light and shadow geometry: red is its `height` as a fraction of the thing's (1 on
 * top), green which way it faces (`south`: a front face, else up; see facingGreen), blue the offset
 * from where it is drawn to where it stands: always straight down, by `drop` px. A top is drawn as far
 * above the floor it covers as the thing rises on screen (a wall's face, the part of a piece bodies
 * step behind: see `depth`). A face is drawn up from its foot but stands just below it, so a pixel
 * `up` rows above the foot drops `up + 0.5`.
 */
function geometryPixel(data: Uint8ClampedArray, i: number, height: number, south: boolean, drop = 0) {
  data[i] = Math.round(height * 255);
  data[i + 1] = facingGreen(south);
  data[i + 2] = 128 + Math.round(drop / GEOMETRY_OFFSET_STEP);
  data[i + 3] = 255;
}

/**
 * Geometry of an autotiled wall tile, for lighting and height-field shadows (see geometryPixel). Its face is drawn
 * up the tile's bottom rows but stands at the wall's south edge, and climbs to the wall's top from the
 * floor or from a lower wall's top (`base`, as a fraction of this wall's height). Its top is drawn as
 * far above the floor it covers as the face is tall, and where the art is clear (above a low wall's
 * top) there's no wall.
 */
function drawAutotileGeometry(ctx: CanvasRenderingContext2D, set: string, mask: number, base: number) {
  const D = faceDepth(set), split = faceLine(set);
  const pieces = wallQuarters(mask);
  const art = canvasFor(`auto:${set}:${mask}`).getContext('2d')!.getImageData(0, 0, 16, 16).data;
  const img = ctx.createImageData(16, 16);
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      const q = py < split ? (px < 8 ? 0 : 1) : (px < 8 ? 3 : 2);
      const up = 15 - py;
      const face = showsFace(q, pieces[q]!) && up < D;
      const i = (py * 16 + px) * 4;
      if (art[i + 3]! <= 40) continue;
      if (face) geometryPixel(img.data, i, base + (up / D) * (1 - base), true, up + 0.5);
      else geometryPixel(img.data, i, 1, false, D);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function missing(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w / 2, h / 2); ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
}

export function tex(key: string): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  let t: Texture;
  const r = key.includes(':') ? undefined : region(key);
  if (r) {
    t = new Texture({ source: atlasTexture!.source, frame: new Rectangle(r.x, r.y, r.w, r.h) });
  } else {
    t = Texture.from(canvasFor(key));
    t.source.scaleMode = 'nearest';
  }
  cache.set(key, t);
  return t;
}

const alphaCache = new Map<string, { w: number; h: number; a: Uint8Array }>();
/** Whether a sprite's pixel (art px from its top-left) is solid (for picking things by their art). */
export function opaqueAt(key: string, x: number, y: number): boolean {
  let m = alphaCache.get(key);
  if (!m) {
    const c = canvasFor(key);
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]! > 40 ? 1 : 0;
    m = { w: c.width, h: c.height, a };
    alphaCache.set(key, m);
  }
  return x >= 0 && y >= 0 && x < m.w && y < m.h && m.a[y * m.w + x] === 1;
}

const spanCache = new Map<string, ({ l: number; r: number } | null)[]>();
/**
 * A sprite's outline a row at a time, top row first: how far left and right of its middle its solid
 * pixels reach (px, to pixel centres), or null for a clear row.
 */
export function rowSpans(key: string): ({ l: number; r: number } | null)[] {
  let rows = spanCache.get(key);
  if (rows) return rows;
  const c = canvasFor(key);
  const { width: w, height: h } = c;
  rows = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) {
      if (!opaqueAt(key, x, y)) continue;
      if (l < 0) l = x;
      r = x;
    }
    rows.push(l < 0 ? null : { l: l + 0.5 - w / 2, r: r + 0.5 - w / 2 });
  }
  spanCache.set(key, rows);
  return rows;
}

const silhouettes = new Map<string, Texture>();

/**
 * A sprite's shape as a solid white mask (opaque pixels white, the rest clear), so that tinting it
 * writes one exact value: the shadow maps draw furniture and actors with these, so shadows take the
 * shape of the art instead of a box.
 */
export function silhouette(key: string): Texture {
  let t = silhouettes.get(key);
  if (t) return t;
  const src = canvasFor(key);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const solid = d[i + 3]! > 40;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = solid ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  silhouettes.set(key, t);
  return t;
}

/** How deep (px) the strip of floor is that an upright sprite blocks light over (see `skyline`). */
export const SKYLINE_DEPTH = 3;

const skylines = new Map<string, Texture>();

/**
 * What an upright sprite blocks, standing on its bottom edge: a strip `SKYLINE_DEPTH` px deep and as
 * wide as the art, where red is how high each column of the art reaches as a fraction of its height
 * (white otherwise, so a tint sets the rest). The shadow maps draw actors' feet with these, so an actor
 * casts its outline from where it stands, not from everywhere its sprite is drawn.
 */
export function skyline(key: string): Texture {
  let t = skylines.get(key);
  if (t) return t;
  const src = canvasFor(key);
  const { width: w, height: h } = src;
  const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = SKYLINE_DEPTH;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, SKYLINE_DEPTH);
  for (let x = 0; x < w; x++) {
    let top = 0;
    while (top < h && px[(top * w + x) * 4 + 3]! <= 40) top++;
    if (top === h) continue;
    for (let y = 0; y < SKYLINE_DEPTH; y++) img.data.set([Math.round(((h - top) / h) * 255), 255, 255, 255], (y * w + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  skylines.set(key, t);
  return t;
}

/**
 * How a height map is painted: a top-facing surface in green and a front face in blue, as bright as it
 * is high: `floor` at the floor and `step` more for each pixel above it (scripts/furniture-heights.mjs
 * draws the swatches).
 */
const HEIGHT_PAINT = { floor: 60, step: 6 };

/**
 * A piece of art's shape in the game's view (from the south, tilted back), read from the height map
 * painted next to it: `<art>_height.png`, the same size, in flat colours (see HEIGHT_PAINT):
 *
 *   green  a top-facing surface, that many pixels above the floor. It is where it's drawn.
 *   blue   a front face (facing south) whose foot is that many pixels above the floor. It climbs a
 *          pixel per row from there, so each column's run of one blue is one face, and it stands just
 *          below its lowest row: on the floor, or on the top painted there.
 *
 * So a bed is a blue foot (0) under a green mattress (4), with a blue headboard (4) and its green top (8).
 */
export interface HeightMap {
  w: number;
  h: number;
  /** Per pixel: how high it is, px above the floor (-1: nothing there). */
  z: Int16Array;
  /** Per pixel: how far below where it's drawn it stands, px (0 for a top). */
  drop: Float32Array;
  /** Per pixel: how tall the piece is there, for what it blocks: a top's height, or the top of the face. */
  block: Int16Array;
  /** The highest point, px. */
  peak: number;
}

const heightMaps = new Map<string, HeightMap | undefined>();

/** The height map painted for a piece of art, if it has one. */
export function heightMap(key: string): HeightMap | undefined {
  if (heightMaps.has(key)) return heightMaps.get(key);
  const map = hasArt(`${key}_height`) ? readHeightMap(key) : undefined;
  heightMaps.set(key, map);
  return map;
}

function readHeightMap(key: string): HeightMap | undefined {
  const src = canvasFor(`${key}_height`), art = canvasFor(key);
  const { width: w, height: h } = src;
  if (w !== art.width || h !== art.height) {
    console.error(`[assets] art/${key}_height.png is ${w}×${h}, but its art is ${art.width}×${art.height}`);
    return undefined;
  }
  const px = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  /** What's painted at a pixel: a front face or a top, and its height (px). */
  const paint = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (y < 0 || px[i + 3]! <= 40) return undefined;
    const front = px[i + 2]! > px[i + 1]!;
    return { front, height: Math.max(0, Math.round((px[i + (front ? 2 : 1)]! - HEIGHT_PAINT.floor) / HEIGHT_PAINT.step)) };
  };
  const map: HeightMap = { w, h, z: new Int16Array(w * h).fill(-1), drop: new Float32Array(w * h), block: new Int16Array(w * h).fill(-1), peak: 0 };
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      const p = paint(x, y);
      if (!p) continue;
      // A face is the run of one blue up this column from here; a top is a single pixel.
      let top = y;
      if (p.front) for (let n = paint(x, top - 1); n?.front && n.height === p.height; n = paint(x, top - 1)) top--;
      const tall = p.front ? p.height + (y - top + 1) : p.height;
      for (let r = top; r <= y; r++) {
        const i = r * w + x;
        map.z[i] = p.front ? p.height + (y - r) : p.height;
        map.drop[i] = p.front ? y - r + 0.5 : 0;
        map.block[i] = tall;
      }
      map.peak = Math.max(map.peak, tall);
      y = top;
    }
  }
  return map;
}

const heightTextures = new Map<string, Texture>();

function heightTexture(cacheKey: string, map: HeightMap, pixel: (data: Uint8ClampedArray, i: number, at: number) => void): Texture {
  let t = heightTextures.get(cacheKey);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = map.w;
  c.height = map.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.w, map.h);
  for (let at = 0; at < map.z.length; at++) if (map.z[at]! >= 0) pixel(img.data, at * 4, at);
  ctx.putImageData(img, 0, 0);
  t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  heightTextures.set(cacheKey, t);
  return t;
}

/**
 * A height-mapped sprite's light and shadow geometry (see geometryPixel), standing `base` px up (on a tabletop),
 * with heights as fractions of `total` px and its tops drawn `topDrop` px above the floor they cover.
 */
export function heightSurface(key: string, map: HeightMap, base: number, total: number, topDrop: number): Texture {
  return heightTexture(`surface|${key}|${base}|${total}|${topDrop}`, map, (data, i, at) => {
    // Only a front face drops by its own rows; a top drops as far as the piece's tops do.
    const face = map.drop[at]! > 0;
    geometryPixel(data, i, (base + map.z[at]!) / total, face, face ? map.drop[at]! : topDrop);
  });
}

/**
 * What a height-mapped sprite blocks: how tall it is at each pixel, as a fraction of `total` px in red
 * (white otherwise, so a tint sets the rest), standing `base` px up.
 */
export function heightOccluder(key: string, map: HeightMap, base: number, total: number): Texture {
  return heightTexture(`occluder|${key}|${base}|${total}`, map, (data, i, at) => {
    data[i] = Math.round(((base + map.block[at]!) / total) * 255);
    data[i + 1] = data[i + 2] = data[i + 3] = 255;
  });
}

/** Data URL for DOM icons. */
export function iconUrl(key: string): string {
  let u = urlCache.get(key);
  if (!u) {
    u = canvasFor(key).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

