import { Rectangle, Texture, TextureStyle } from 'pixi.js';
import { registry, wallQuarters, type SurfaceDef, type WallPiece } from '@df/shared';
import { drawLight } from './procedural';

/**
 * Key-based texture registry. Game code only ever refers to sprite keys:
 *   <path>               a PNG under apps/client/art/, without the extension ('furniture/sofa'). A folder
 *                        of numbered PNGs is an animation: its frames are '<path>/0', '<path>/1'… (see
 *                        `frameKeys`), and the folder's own key is its first frame.
 *   wall:<surfaceId>     a tall wall face covered in that wallpaper
 *   wallshort:<surfaceId> a short wall covered in that wallpaper
 *   auto:<set>:<mask>[:<surfaceId>]  an autotiled wall tile (see world/autotile.ts), composed from
 *                        the pieces in art/walls/<set>/, optionally wallpapered
 *   autogeo:<set>:<mask> the same tile's geometry for shadows (see drawAutotileGeometry)
 * Swapping art means editing the PNGs, never game code.
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
let lightTexture: Texture | null = null;

/**
 * Wall art, a folder per set (art/walls/<set>/): the 8×8 pieces outer / edge / inner / fill, each drawn
 * as a tile's top-left quarter (open toward north and west), and next to each an optional wallpaper
 * mask (<piece>_mask). Placeholders come from scripts/wall-placeholders.mjs.
 */
const WALL_PIECES: WallPiece[] = ['outer', 'edge', 'inner', 'fill'];
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

/** Every enemy needs its idle art, the frames of each animation it names, and whatever it holds. */
function checkEnemyArt(): void {
  for (const def of registry.enemies.all()) {
    const keys = [def.sprite, ...Object.values(def.anims ?? {}).map((a) => a.frames), ...(def.held ? [def.held.sprite] : [])];
    for (const key of keys) if (!hasArt(key)) console.error(`[assets] enemy '${def.id}' has no art/${key}.png (or frames ${key}/0.png…)`);
  }
}

/** Every piece needs a south view; north and side are drawn case by case (a missing one uses south). */
function checkFurnitureArt(): void {
  for (const def of registry.furniture.all()) {
    if (!hasArt(`${def.sprite}/south`)) console.error(`[assets] furniture '${def.id}' has no art/${def.sprite}/south.png`);
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
    drawAutotileGeometry(ctx, name, Number(arg));
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

/** Copy an 8×8 wall piece (or its wallpaper mask; a piece without one takes no paper) onto `target` at `dx, dy`. */
function drawPiece(target: CanvasRenderingContext2D, set: string, piece: WallPiece, mask: boolean, dx: number, dy: number) {
  const r = wallPiece(set, piece, mask);
  if (r) target.drawImage(atlasCanvas!, r.x, r.y, 8, 8, dx, dy, 8, 8);
}

/** Compose a wall tile from its four rotated quarter pieces, then lay wallpaper over the face mask. */
function drawAutotile(ctx: CanvasRenderingContext2D, set: string, mask: number, surface?: string) {
  if (!WALL_PIECES.every((p) => wallPiece(set, p))) return missing(ctx);
  const quarters = wallQuarters(mask);
  const blit = (target: CanvasRenderingContext2D, paperMask: boolean) =>
    quarters.forEach(({ piece, rot }, q) => {
      const qx = q === 1 || q === 2 ? 8 : 0, qy = q >= 2 ? 8 : 0;
      target.save();
      target.translate(qx + 4, qy + 4);
      // The fill has no open side to face: left unturned, its texture runs the same way in every quarter.
      if (piece !== 'fill') target.rotate((rot * Math.PI) / 2);
      drawPiece(target, set, piece, paperMask, -4, -4);
      target.restore();
    });
  blit(ctx, false);
  const s = surface ? registry.surfaces.tryGet(surface) : undefined;
  if (!s) return;
  const paper = document.createElement('canvas');
  paper.width = paper.height = 16;
  const p = paper.getContext('2d')!;
  p.imageSmoothingEnabled = false;
  blit(p, true);
  p.globalCompositeOperation = 'source-in';
  p.drawImage(canvasFor(s.sprite), 0, 0);
  ctx.drawImage(paper, 0, 0);
}

/**
 * Face depth of a wall set in pixels: how far the face reaches into the edge piece, read from its
 * wallpaper mask (outline row + masked face rows). Faces run from the floor (depth 0) to the top.
 */
const faceDepthCache = new Map<string, number>();
function faceDepth(set: string): number {
  let d = faceDepthCache.get(set);
  if (d !== undefined) return d;
  d = 4;
  if (wallPiece(set, 'edge', true)) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    drawPiece(x, set, 'edge', true, 0, 0);
    const a = x.getImageData(0, 0, 8, 8).data;
    let rows = 0;
    for (let y = 0; y < 8; y++) if (a[(y * 8 + 3) * 4 + 3]! > 0) rows = y;
    if (rows > 0) d = rows + 1;
  }
  faceDepthCache.set(set, d);
  return d;
}

/**
 * Geometry of an autotiled wall tile, for height-field shadows: per pixel, red is the height up the
 * wall (0 at the floor, 1 on top), green / blue the offset (px, ±16 → 0..1) from where the pixel is
 * drawn to the face it belongs to. Faces are drawn leaning out from the wall but stand at its edge.
 */
function drawAutotileGeometry(ctx: CanvasRenderingContext2D, set: string, mask: number) {
  const D = faceDepth(set);
  const quarters = wallQuarters(mask);
  const img = ctx.createImageData(16, 16);
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      const q = py < 8 ? (px < 8 ? 0 : 1) : (px < 8 ? 3 : 2);
      const { piece, rot } = quarters[q]!;
      // Undo the quarter's rotation to find the pixel in the canonical (top-left) piece.
      let x = px % 8, y = py % 8;
      for (let r = 0; r < rot; r++) [x, y] = [y, 7 - x];
      let z = 1, ox = 0, oy = 0;
      if (piece === 'edge' && y <= D) {
        z = y / D; oy = -(y + 0.5);
      } else if (piece === 'outer' && Math.min(x, y) <= D) {
        z = Math.min(x, y) / D;
        if (y <= x) oy = -(y + 0.5); else ox = -(x + 0.5);
      } else if (piece === 'inner' && x <= D && y <= D) {
        z = Math.max(x, y) / D; ox = -(x + 0.5); oy = -(y + 0.5);
      }
      // Turn the offset back into the tile's frame.
      for (let r = 0; r < rot; r++) [ox, oy] = [-oy, ox];
      const i = (py * 16 + px) * 4;
      img.data[i] = Math.round(z * 255);
      img.data[i + 1] = Math.round((0.5 + ox / 32) * 255);
      img.data[i + 2] = Math.round((0.5 + oy / 32) * 255);
      img.data[i + 3] = 255;
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

/** Data URL for DOM icons. */
export function iconUrl(key: string): string {
  let u = urlCache.get(key);
  if (!u) {
    u = canvasFor(key).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

export function lightTex(): Texture {
  if (!lightTexture) lightTexture = Texture.from(drawLight(128));
  return lightTexture;
}
