import { Assets as PixiAssets, Rectangle, Texture, TextureStyle } from 'pixi.js';
import { registry, wallQuarters, type SurfaceDef, type WallPiece } from '@df/shared';
import { drawPattern, drawLight, drawers } from './procedural';

/**
 * Key-based texture registry. Game code only ever refers to sprite keys:
 *   td:<n>   Kenney Tiny Dungeon (CC0) tile n
 *   ri:<n>   Kenney Roguelike Indoors (CC0) tile n
 *   proc:<name>[:<arg>]  procedurally drawn (see procedural.ts)
 *   surf:<surfaceId>     floor/wall surface pattern
 *   wall:<surfaceId>     a tall wall face covered in that wallpaper
 *   wallshort:<surfaceId> a short wall covered in that wallpaper
 *   auto:<set>:<mask>[:<surfaceId>]  an autotiled wall tile (see world/autotile.ts), composed from
 *                        the piece sheet public/assets/walls/<set>.png, optionally wallpapered
 *   autogeo:<set>:<mask> the same tile's geometry for shadows (see drawAutotileGeometry)
 * Swapping art means changing these mappings, never game code.
 */
interface Sheet { image: HTMLImageElement; texture: Texture; cols: number; stride: number }

const sheets: Record<string, Sheet> = {};
const cache = new Map<string, Texture>();
const canvasCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();
let lightTexture: Texture | null = null;

/**
 * Wall piece sheets, 32×16: row 0 holds the 8×8 pieces outer / edge / inner / fill, each drawn as a
 * tile's top-left quarter (open toward north and west); row 1 holds matching wallpaper masks.
 * Placeholders come from scripts/wall-placeholders.mjs.
 */
const wallSheets: Record<string, HTMLImageElement | null> = {};
const PIECE_X: Record<WallPiece, number> = { outer: 0, edge: 8, inner: 16, fill: 24 };

const SHEETS = {
  td: { url: '/assets/kenney-tiny-dungeon/tilemap_packed.png', cols: 12, stride: 16 },
  ri: { url: '/assets/kenney-roguelike-indoors/sheet.png', cols: 27, stride: 17 },
};

export async function loadAssets(): Promise<void> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  for (const [prefix, s] of Object.entries(SHEETS)) {
    const texture: Texture = await PixiAssets.load(s.url);
    texture.source.scaleMode = 'nearest';
    const image = await loadImage(s.url);
    sheets[prefix] = { image, texture, cols: s.cols, stride: s.stride };
  }
  const sets = new Set(registry.obstacles.all().flatMap((o) => (o.autotile ? [o.autotile.set] : [])));
  await Promise.all([...sets].map(async (set) => {
    wallSheets[set] = await loadImage(`/assets/walls/${set}.png`).catch(() => {
      console.warn(`[assets] missing wall sheet walls/${set}.png`);
      return null;
    });
  }));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

/** Draw the 16×16 source for a key onto a fresh canvas. */
export function canvasFor(key: string): HTMLCanvasElement {
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const [prefix, name, arg] = key.split(':') as [string, string, string | undefined];
  if (prefix in sheets) {
    const s = sheets[prefix]!;
    const n = Number(name);
    ctx.drawImage(s.image, (n % s.cols) * s.stride, Math.floor(n / s.cols) * s.stride, 16, 16, 0, 0, 16, 16);
  } else if (prefix === 'proc') {
    const d = drawers[name];
    if (d) d(ctx, arg);
    else missing(ctx);
  } else if (prefix === 'auto') {
    drawAutotile(ctx, name, Number(arg), key.split(':')[3]);
  } else if (prefix === 'autogeo') {
    drawAutotileGeometry(ctx, name, Number(arg));
  } else if (prefix === 'surf' || prefix === 'wall' || prefix === 'wallshort') {
    const s = registry.surfaces.tryGet(name);
    if (s) drawSurface(ctx, prefix, s);
    else missing(ctx);
  } else {
    missing(ctx);
  }
  canvasCache.set(key, c);
  return c;
}

function drawSurface(ctx: CanvasRenderingContext2D, prefix: string, s: SurfaceDef) {
  const { style, base, accent } = s.pattern;
  if (prefix === 'surf') return drawPattern(ctx, style, base, accent);
  if (prefix === 'wall') {
    drawPattern(ctx, style, base, accent);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, 16, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 13, 16, 3);
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(0, 14, 16, 2);
    return;
  }
  // Short wall: only the lower block is papered.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 4, 16, 11); ctx.clip();
  drawPattern(ctx, style, base, accent);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 4, 16, 2);
  ctx.fillStyle = '#5a3a24'; ctx.fillRect(0, 13, 16, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(1, 15, 15, 1);
}

/** Compose a wall tile from its four rotated quarter pieces, then lay wallpaper over the face mask. */
function drawAutotile(ctx: CanvasRenderingContext2D, set: string, mask: number, surface?: string) {
  const img = wallSheets[set];
  if (!img) return missing(ctx);
  const quarters = wallQuarters(mask);
  const blit = (target: CanvasRenderingContext2D, row: number) =>
    quarters.forEach(({ piece, rot }, q) => {
      const qx = q === 1 || q === 2 ? 8 : 0, qy = q >= 2 ? 8 : 0;
      target.save();
      target.translate(qx + 4, qy + 4);
      target.rotate((rot * Math.PI) / 2);
      target.drawImage(img, PIECE_X[piece], row * 8, 8, 8, -4, -4, 8, 8);
      target.restore();
    });
  blit(ctx, 0);
  const s = surface ? registry.surfaces.tryGet(surface) : undefined;
  if (!s) return;
  const paper = document.createElement('canvas');
  paper.width = paper.height = 16;
  const p = paper.getContext('2d')!;
  p.imageSmoothingEnabled = false;
  blit(p, 1);
  p.globalCompositeOperation = 'source-in';
  p.drawImage(canvasFor(`surf:${s.id}`), 0, 0);
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
  const img = wallSheets[set];
  if (img) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, PIECE_X.edge, 8, 8, 8, 0, 0, 8, 8);
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
  ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8);
}

export function tex(key: string): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  let t: Texture;
  const [prefix, name] = key.split(':') as [string, string];
  const s = sheets[prefix];
  if (s) {
    const n = Number(name);
    t = new Texture({
      source: s.texture.source,
      frame: new Rectangle((n % s.cols) * s.stride, Math.floor(n / s.cols) * s.stride, 16, 16),
    });
  } else {
    t = Texture.from(canvasFor(key));
    t.source.scaleMode = 'nearest';
  }
  cache.set(key, t);
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
