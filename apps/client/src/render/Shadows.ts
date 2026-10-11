import { Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TILE_PX, footprint, registry, solidBoxes, wallMask, type AreaLayout, type WallHeight } from '@df/shared';
import { silhouette, tex } from '../engine/assets';
import { buildFurnitureView, furnitureArt } from './RoomRenderer';

/** Heights in tiles. Shadows are cast in 3D against these, so taller things throw longer shadows. */
const WALL_HEIGHT: Record<WallHeight, number> = { none: 0, short: 0.6, tall: 2.2 };
const FURNITURE_HEIGHT = 0.7;
export const ACTOR_HEIGHT = 0.8;
export const DEFAULT_LIGHT_HEIGHT = 1.5;
/** Heights are stored in a colour channel as h / HEIGHT_SCALE. */
export const HEIGHT_SCALE = 4;
/** Occluder map texels per tile: one per pixel, so shadow edges are as crisp as the art. */
export const OCC_RES = 16;

/** Actors the occluder map can tell apart; any more block light but are shaded by themselves. */
export const MAX_ACTORS = 32;

/** One sprite of an actor as drawn: its texture, `dy` px below the actor's position, mirrored by `sx`/`sy`. */
export interface ShadowSprite { key: string; dy: number; sx: number; sy: number }
/**
 * An actor (player, enemy, tenant) at `x`, `y` (tiles), `h` tiles tall. Its sprites' silhouettes block
 * light, and are themselves lit as the spot it stands on is (see the shader in Lighting.ts).
 */
export interface ShadowBlob { x: number; y: number; h: number; sprites: ShadowSprite[] }

const heightColor = (h: number, g = 0.5, b = 0.5) =>
  (Math.round((Math.min(h, HEIGHT_SCALE) / HEIGHT_SCALE) * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

/**
 * The two height maps the shadow shader (Lighting.ts) marches through, over the area's active rooms:
 *
 *   surface  (1 texel per pixel): the height of what is drawn there, and for wall faces the offset
 *            back to the face's real position at the wall's edge. Floors are 0, wall tops and
 *            furniture their height, faces ramp from 0 at the floor to the top. That is what lets
 *            shadows stop at a wall and climb its face instead of running across its top.
 *   occluder (OCC_RES texels per tile): how tall whatever blocks light at that spot is: walls,
 *            furniture and, redrawn every frame, the player and enemies. Green says whose pixel it
 *            is: an actor's index in the frame's list + 1, or 128 (never an index) for the rest.
 */
export class ShadowMaps {
  surface: RenderTexture | null = null;
  occluders: RenderTexture | null = null;
  /** World-pixel rectangle both maps cover (the active rooms' bounds). */
  readonly area = { x: 0, y: 0, w: 1, h: 1 };
  private occRoot = new Container();
  private occStatic = new Graphics();
  private occFurniture = new Container();
  private occActors = new Container();
  private actorPool: Sprite[] = [];

  constructor() {
    this.occRoot.addChild(this.occStatic, this.occFurniture, this.occActors);
  }

  rebuild(layout: AreaLayout, renderer: Renderer): void {
    const ox = layout.originX, oy = layout.originY;
    Object.assign(this.area, { x: ox * TILE_PX, y: oy * TILE_PX, w: layout.w * TILE_PX, h: layout.h * TILE_PX });
    this.surface = sized(this.surface, layout.w * TILE_PX, layout.h * TILE_PX);
    this.occluders = sized(this.occluders, layout.w * OCC_RES, layout.h * OCC_RES);

    const surf = new Container();
    const flat = new Graphics();
    surf.addChild(flat);
    const occ = this.occStatic.clear();
    for (const { x, y } of layout.tiles()) {
      const o = layout.obstacleAt(x, y);
      const h = WALL_HEIGHT[o?.height ?? 'none'];
      if (!h) continue;
      occ.rect((x - ox) * OCC_RES, (y - oy) * OCC_RES, OCC_RES, OCC_RES).fill(heightColor(h));
      if (o!.autotile) {
        const s = new Sprite(tex(`autogeo:${o!.autotile.set}:${wallMask(layout, x, y)}`));
        s.position.set((x - ox) * TILE_PX, (y - oy) * TILE_PX);
        // The texture holds height as a fraction of the wall; the tint scales it to this wall's height.
        s.tint = heightColor(h, 1, 1);
        surf.addChild(s);
      } else {
        flat.rect((x - ox) * TILE_PX, (y - oy) * TILE_PX, TILE_PX, TILE_PX).fill(heightColor(h));
      }
    }
    // Furniture after walls so its tops win where they meet. The surface map gets the art as drawn (a
    // tall lamp's top is lit as an upright thing). What blocks light is what stands on the floor: the
    // piece's collision boxes when its def gives them (a lamp blocks at its stand), else its art's
    // silhouette within its footprint (a sofa casts a sofa-shaped shadow, and art drawn above its
    // tiles doesn't block light there). A piece on a tabletop stands on it.
    for (const c of this.occFurniture.removeChildren()) c.destroy({ children: true });
    const boxes = new Graphics();
    this.occFurniture.addChild(boxes);
    const pieces = layout.furniture().map((f) => ({ f, base: layout.onTopOf(f) })).sort((a, b) => Number(!!a.base) - Number(!!b.base));
    for (const { f, base } of pieces) {
      const def = registry.furniture.get(f.defId);
      const { w, h: fh } = footprint(def, f.rot);
      const baseDef = base && registry.furniture.get(base.defId);
      const h = (def.height ?? FURNITURE_HEIGHT) + (baseDef ? baseDef.height ?? FURNITURE_HEIGHT : 0);
      const lift = baseDef?.tabletop ?? 0;
      const cx = (f.x + w / 2 - ox) * TILE_PX, cy = (f.y + fh / 2 - oy) * TILE_PX - lift;
      const top = buildFurnitureView(f.defId, f.rot, silhouette, heightColor(h));
      top.position.set(cx, cy);
      surf.addChild(top);
      if (def.collision) {
        for (const b of solidBoxes(def, f)) {
          boxes.rect((b.x - ox) * OCC_RES, (b.y - oy) * OCC_RES - lift * (OCC_RES / TILE_PX), b.w * OCC_RES, b.h * OCC_RES).fill(heightColor(h));
        }
        continue;
      }
      const art = furnitureArt(f.defId, f.rot);
      const block = new Sprite(footprintSilhouette(art.key, w, fh));
      block.anchor.set(0.5, 1);
      block.tint = heightColor(h);
      block.position.set(cx * (OCC_RES / TILE_PX), (cy + (fh * TILE_PX) / 2) * (OCC_RES / TILE_PX));
      block.scale.set((art.mirror ? -1 : 1) * (OCC_RES / TILE_PX), OCC_RES / TILE_PX);
      this.occFurniture.addChild(block);
    }
    renderer.render({ container: surf, target: this.surface, clear: true, clearColor: [0, 0.5, 0.5, 1] });
    surf.destroy({ children: true });
  }

  /** Redraw the occluder map with the actors where they are now (as their sprites' silhouettes). */
  renderOccluders(renderer: Renderer, blobs: ShadowBlob[]): void {
    if (!this.occluders) return;
    const s = OCC_RES / TILE_PX;
    let used = 0;
    blobs.forEach((b, i) => {
      const px = b.x * OCC_RES - this.area.x * s, py = b.y * OCC_RES - this.area.y * s;
      const tint = i < MAX_ACTORS ? heightColor(b.h, (i + 1) / 255) : heightColor(b.h);
      for (const part of b.sprites) {
        let sp = this.actorPool[used];
        if (!sp) {
          sp = new Sprite();
          sp.anchor.set(0.5, 0.75);
          this.actorPool.push(sp);
          this.occActors.addChild(sp);
        }
        used++;
        sp.visible = true;
        sp.texture = silhouette(part.key);
        sp.tint = tint;
        sp.position.set(px, py + part.dy * s);
        sp.scale.set(part.sx * s, part.sy * s);
      }
    });
    for (let i = used; i < this.actorPool.length; i++) this.actorPool[i]!.visible = false;
    renderer.render({ container: this.occRoot, target: this.occluders, clear: true, clearColor: [0, 0.5, 0.5, 1] });
  }
}

/**
 * The part of a sprite's silhouette over its footprint (`w`×`h` tiles): art stands on the footprint's
 * bottom edge, centred, so that's its bottom `h` tiles and middle `w` tiles.
 */
const footprintCache = new Map<string, Texture>();
function footprintSilhouette(key: string, w: number, h: number): Texture {
  const k = `${key}|${w}x${h}`;
  let t = footprintCache.get(k);
  if (t) return t;
  const full = silhouette(key);
  const W = full.width, H = full.height, fw = w * TILE_PX, fh = h * TILE_PX;
  const x0 = Math.max(0, (W - fw) / 2), y0 = Math.max(0, H - fh);
  t = new Texture({ source: full.source, frame: new Rectangle(x0, y0, Math.min(W, fw), Math.min(H, fh)) });
  footprintCache.set(k, t);
  return t;
}

function sized(rt: RenderTexture | null, w: number, h: number): RenderTexture {
  if (rt && rt.width === w && rt.height === h) return rt;
  rt?.destroy(true);
  const next = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' });
  return next;
}
