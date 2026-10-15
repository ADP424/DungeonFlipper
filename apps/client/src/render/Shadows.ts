import { Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TILE_PX, baseDepth, footprint, registry, solidBoxes, wallMask, type AreaLayout, type WallHeight } from '@df/shared';
import { GEOMETRY_OFFSET_STEP, heightMap, heightOccluder, heightSurface, silhouette, skyline, tex } from '../engine/assets';
import { buildFurnitureView, furnitureArt, furnitureDepth } from './RoomRenderer';

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
 * An actor (player, enemy, tenant) standing at `x`, `y` (tiles), `h` tiles tall, sorted in depth at
 * `sort` (its view's zIndex). It is an upright card there: it blocks light along its feet, as high as
 * its sprites' outline, and each of its pixels is lit as that height above where it stands (see the
 * shader in Lighting.ts).
 */
export interface ShadowBlob { x: number; y: number; h: number; sort: number; sprites: ShadowSprite[] }

/** Nothing there: no height, facing up, no offset, nobody's pixel (see heightColor). */
const CLEAR = [0, 128 / 255, 128 / 255, 1];

/** The blue of a flat tint for something drawn `drop` px above the floor it covers (see geometryPixel in assets.ts). */
const dropBlue = (drop: number) => (128 + Math.round(drop / GEOMETRY_OFFSET_STEP)) / 255;

const heightColor = (h: number, g = 0.5, b = 0.5) =>
  (Math.round((Math.min(h, HEIGHT_SCALE) / HEIGHT_SCALE) * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

/**
 * The maps the light shader (Lighting.ts) reads, over the area's active rooms:
 *
 *   surface  (1 texel per pixel): the height of what is drawn there, which way it faces (up, or south
 *            for a front face), and the offset back to where it really stands (a face at its foot, a
 *            top over the floor it covers). Lights reach each pixel there. Floors are 0, wall tops and
 *            furniture their height, faces ramp from 0 at the floor to the top. That is what lets
 *            shadows stop at a wall and climb its face instead of running across its top. A top is
 *            drawn above the floor it covers by as much of the thing as bodies can step behind (its
 *            tile or footprint less its `depth`), so a shadow cast onto it from behind starts at its
 *            back edge, where the body casting it is seen to stand.
 *   occluder (OCC_RES texels per tile): how tall whatever blocks light at that spot is, over the
 *            floor it stands on (not what it's drawn over, where bodies step behind it): walls,
 *            furniture and, redrawn every frame, the feet of the player and enemies. Green says whose
 *            it is: an actor's index in the frame's list + 1, or 128 (never an index) for the rest.
 *   actors   (1 texel per pixel, redrawn every frame): which actor is seen at each pixel (red: its
 *            index + 1; 0 for none). Their sprites are drawn in depth order with black copies of what
 *            stands in the room (walls, furniture), exactly as on screen, so the part of an actor
 *            hidden behind something isn't the actor's.
 */
export class ShadowMaps {
  surface: RenderTexture | null = null;
  occluders: RenderTexture | null = null;
  actors: RenderTexture | null = null;
  /** World-pixel rectangle both maps cover (the active rooms' bounds). */
  readonly area = { x: 0, y: 0, w: 1, h: 1 };
  private occRoot = new Container();
  private occStatic = new Graphics();
  private occFurniture = new Container();
  private occActors = new Container();
  private feetPool: Sprite[] = [];
  /** The actors map's scene: what stands in the room (`covers`, black) and the actors' sprites, sorted as on screen. */
  private seen = new Container();
  private covers: Container[] = [];
  private seenPool: Sprite[] = [];

  constructor() {
    this.occRoot.addChild(this.occStatic, this.occFurniture, this.occActors);
    this.seen.sortableChildren = true;
  }

  rebuild(layout: AreaLayout, renderer: Renderer): void {
    const ox = layout.originX, oy = layout.originY;
    Object.assign(this.area, { x: ox * TILE_PX, y: oy * TILE_PX, w: layout.w * TILE_PX, h: layout.h * TILE_PX });
    this.surface = sized(this.surface, layout.w * TILE_PX, layout.h * TILE_PX);
    this.occluders = sized(this.occluders, layout.w * OCC_RES, layout.h * OCC_RES);
    this.actors = sized(this.actors, layout.w * TILE_PX, layout.h * TILE_PX);
    for (const c of this.covers) c.destroy({ children: true });
    this.covers = [];
    const cover = <T extends Container>(c: T, sort: number): T => {
      c.zIndex = sort;
      this.covers.push(c);
      this.seen.addChild(c);
      return c;
    };

    const surf = new Container();
    const flat = new Graphics();
    surf.addChild(flat);
    const occ = this.occStatic.clear();
    for (const { x, y } of layout.tiles()) {
      const o = layout.obstacleAt(x, y);
      const h = WALL_HEIGHT[o?.height ?? 'none'];
      if (!h) continue;
      const solid = layout.tileSolid(x, y);
      occ.rect((solid.x - ox) * OCC_RES, (solid.y - oy) * OCC_RES, solid.w * OCC_RES, solid.h * OCC_RES).fill(heightColor(h));
      // It covers what's behind it, as drawn (an autotiled wall's art may be clear above a low top).
      const shape = o!.autotile ? new Sprite(silhouette(`auto:${o!.autotile.set}:${wallMask(layout, x, y)}`)) : new Sprite(Texture.WHITE);
      shape.tint = 0x000000;
      shape.setSize(TILE_PX);
      cover(shape, layout.backEdge(x, y)).position.set((x - ox) * TILE_PX, (y - oy) * TILE_PX);
      if (o!.autotile) {
        // A face above something lower to the south (a low wall) stands on its top, not on the floor.
        const below = WALL_HEIGHT[layout.obstacleAt(x, y + 1)?.height ?? 'none'];
        const s = new Sprite(tex(`autogeo:${o!.autotile.set}:${wallMask(layout, x, y)}:${below < h ? below / h : 0}`));
        s.position.set((x - ox) * TILE_PX, (y - oy) * TILE_PX);
        // The texture holds height as a fraction of the wall; the tint scales it to this wall's height.
        s.tint = heightColor(h, 1, 1);
        surf.addChild(s);
      } else {
        flat.rect((x - ox) * TILE_PX, (y - oy) * TILE_PX, TILE_PX, TILE_PX).fill(heightColor(h));
      }
    }
    // Furniture after walls so its tops win where they meet. The surface map gets the art as drawn: its
    // tops and faces at their own heights when the view has a painted height map, else all of it at the
    // piece's height (a tall lamp's top is lit as an upright thing). What blocks light is what stands
    // on the floor: the piece's collision boxes when its def gives them (a lamp blocks at its stand),
    // else its art within its footprint (a sofa casts a sofa-shaped shadow, and art drawn above its
    // tiles doesn't block light there), as tall as its height map says. A piece on a tabletop stands on it.
    for (const c of this.occFurniture.removeChildren()) c.destroy({ children: true });
    const boxes = new Graphics();
    this.occFurniture.addChild(boxes);
    const pieces = layout.furniture().map((f) => ({ f, base: layout.onTopOf(f) })).sort((a, b) => Number(!!a.base) - Number(!!b.base));
    for (const { f, base } of pieces) {
      const def = registry.furniture.get(f.defId);
      const { w, h: fh } = footprint(def, f.rot);
      const baseDef = base && registry.furniture.get(base.defId);
      const art = furnitureArt(f.defId, f.rot);
      const map = heightMap(art.key);
      const under = baseDef ? baseDef.height ?? FURNITURE_HEIGHT : 0;
      const h = under + (map ? map.peak / TILE_PX : def.height ?? FURNITURE_HEIGHT);
      // Height maps are in pixels; their textures hold fractions of the height the tint carries.
      const basePx = under * TILE_PX, totalPx = Math.max(1, h * TILE_PX);
      const lift = baseDef?.tabletop ?? 0;
      const cx = (f.x + w / 2 - ox) * TILE_PX, cy = (f.y + fh / 2 - oy) * TILE_PX - lift;
      const deep = def.collision ? fh : baseDepth(def, f.rot);
      const topDrop = (fh - deep) * TILE_PX;
      const top = map
        ? buildFurnitureView(f.defId, f.rot, (key) => heightSurface(key, map, basePx, totalPx, topDrop), heightColor(h, 1, 1))
        : buildFurnitureView(f.defId, f.rot, silhouette, heightColor(h, 0.5, dropBlue(topDrop)));
      top.position.set(cx, cy);
      surf.addChild(top);
      cover(buildFurnitureView(f.defId, f.rot, silhouette, 0x000000), furnitureDepth(f, base)).position.set(cx, cy);
      if (def.collision) {
        for (const b of solidBoxes(def, f)) {
          boxes.rect((b.x - ox) * OCC_RES, (b.y - oy) * OCC_RES - lift * (OCC_RES / TILE_PX), b.w * OCC_RES, b.h * OCC_RES).fill(heightColor(h));
        }
        continue;
      }
      const block = new Sprite(overFootprint(map ? heightOccluder(art.key, map, basePx, totalPx) : silhouette(art.key), w, deep));
      block.anchor.set(0.5, 1);
      block.tint = heightColor(h);
      block.position.set(cx * (OCC_RES / TILE_PX), (cy + (fh * TILE_PX) / 2) * (OCC_RES / TILE_PX));
      block.scale.set((art.mirror ? -1 : 1) * (OCC_RES / TILE_PX), OCC_RES / TILE_PX);
      this.occFurniture.addChild(block);
    }
    renderer.render({ container: surf, target: this.surface, clear: true, clearColor: CLEAR });
    surf.destroy({ children: true });
  }

  /**
   * Redraw the maps the actors are in, with them where they are now: the occluder map with their feet
   * (each sprite's skyline, standing where the actor does), and the actors map with their sprites as
   * drawn, among what covers them.
   */
  renderActors(renderer: Renderer, blobs: ShadowBlob[]): void {
    if (!this.occluders || !this.actors) return;
    const s = OCC_RES / TILE_PX;
    let used = 0;
    const pooled = (pool: Sprite[], into: Container, ax: number, ay: number): Sprite => {
      let sp = pool[used];
      if (!sp) {
        sp = new Sprite();
        sp.anchor.set(ax, ay);
        pool.push(sp);
        into.addChild(sp);
      }
      sp.visible = true;
      return sp;
    };
    blobs.forEach((b, i) => {
      const x = b.x * TILE_PX - this.area.x, y = b.y * TILE_PX - this.area.y;
      const known = i < MAX_ACTORS;
      for (const part of b.sprites) {
        // Its feet: the strip of floor just behind where it stands.
        const foot = pooled(this.feetPool, this.occActors, 0.5, 1);
        foot.texture = skyline(part.key);
        foot.tint = known ? heightColor(b.h, (i + 1) / 255) : heightColor(b.h);
        foot.position.set(x * s, y * s);
        foot.scale.set(part.sx * s, s);
        // Itself, as drawn (an actor's sprite is anchored three quarters of the way down).
        const body = pooled(this.seenPool, this.seen, 0.5, 0.75);
        body.texture = silhouette(part.key);
        body.tint = known ? (i + 1) << 16 : 0x000000;
        body.position.set(x, y + part.dy);
        body.scale.set(part.sx, part.sy);
        body.zIndex = b.sort;
        used++;
      }
    });
    for (let i = used; i < this.feetPool.length; i++) this.feetPool[i]!.visible = this.seenPool[i]!.visible = false;
    renderer.render({ container: this.occRoot, target: this.occluders, clear: true, clearColor: CLEAR });
    renderer.render({ container: this.seen, target: this.actors, clear: true, clearColor: [0, 0, 0, 1] });
  }
}

/**
 * The part of a sprite-shaped texture (a silhouette, a height map's occluder) over the floor it
 * stands on (`w`×`h` tiles): art stands on the footprint's bottom edge, centred, so that's its bottom
 * `h` tiles and middle `w` tiles.
 */
const footprintCache = new Map<string, Texture>();
function overFootprint(full: Texture, w: number, h: number): Texture {
  const k = `${full.uid}|${w}x${h}`;
  let t = footprintCache.get(k);
  if (t) return t;
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
