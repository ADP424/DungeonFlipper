import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { TILE_PX, footprint, registry, wallMask, type RoomLayout, type WallHeight } from '@df/shared';
import { tex } from '../engine/assets';

/** Heights in tiles. Shadows are cast in 3D against these, so taller things throw longer shadows. */
const WALL_HEIGHT: Record<WallHeight, number> = { none: 0, short: 0.6, tall: 2.2 };
const FURNITURE_HEIGHT = 0.7;
export const ACTOR_HEIGHT = 0.8;
export const DEFAULT_LIGHT_HEIGHT = 1.5;
/** Heights are stored in a colour channel as h / HEIGHT_SCALE. */
export const HEIGHT_SCALE = 4;
/** Occluder map texels per tile: one per pixel, so shadow edges are as crisp as the art. */
export const OCC_RES = 16;

/** A round occluder (player, enemies). Its drawn sprite counts as standing on top of it. */
export interface ShadowBlob { x: number; y: number; r: number; h: number }

const heightColor = (h: number, g = 0.5, b = 0.5) =>
  (Math.round((Math.min(h, HEIGHT_SCALE) / HEIGHT_SCALE) * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

/**
 * The two height maps the shadow shader (Lighting.ts) marches through, per room:
 *
 *   surface  (1 texel per pixel): the height of what is drawn there, and for wall faces the offset
 *            back to the face's real position at the wall's edge. Floors are 0, wall tops and
 *            furniture their height, faces ramp from 0 at the floor to the top. That is what lets
 *            shadows stop at a wall and climb its face instead of running across its top.
 *   occluder (OCC_RES texels per tile): how tall whatever blocks light at that spot is: walls,
 *            furniture and, redrawn every frame, the player and enemies.
 */
export class ShadowMaps {
  surface: RenderTexture | null = null;
  occluders: RenderTexture | null = null;
  /** World-pixel rectangle both maps cover (the room's bounds). */
  readonly area = { x: 0, y: 0, w: 1, h: 1 };
  private occRoot = new Container();
  private occStatic = new Graphics();
  private occActors = new Graphics();

  constructor() {
    this.occRoot.addChild(this.occStatic, this.occActors);
  }

  rebuild(layout: RoomLayout, renderer: Renderer): void {
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
    // Furniture after walls so its tops win where they meet.
    const furn = new Graphics();
    surf.addChild(furn);
    for (const f of layout.state.furniture) {
      const def = registry.furniture.get(f.defId);
      const { w, h: fh } = footprint(def, f.rot);
      const h = def.height ?? FURNITURE_HEIGHT;
      furn.rect((f.x - ox) * TILE_PX, (f.y - oy) * TILE_PX, w * TILE_PX, fh * TILE_PX).fill(heightColor(h));
      occ.rect((f.x - ox) * OCC_RES, (f.y - oy) * OCC_RES, w * OCC_RES, fh * OCC_RES).fill(heightColor(h));
    }
    renderer.render({ container: surf, target: this.surface, clear: true, clearColor: [0, 0.5, 0.5, 1] });
    surf.destroy({ children: true });
  }

  /** Redraw the occluder map with the actors where they are now. */
  renderOccluders(renderer: Renderer, blobs: ShadowBlob[]): void {
    if (!this.occluders) return;
    const g = this.occActors.clear();
    const s = OCC_RES / TILE_PX;
    for (const b of blobs) {
      g.circle(b.x * OCC_RES - this.area.x * s, b.y * OCC_RES - this.area.y * s, b.r * OCC_RES).fill(heightColor(b.h));
    }
    renderer.render({ container: this.occRoot, target: this.occluders, clear: true, clearColor: [0, 0.5, 0.5, 1] });
  }
}

function sized(rt: RenderTexture | null, w: number, h: number): RenderTexture {
  if (rt && rt.width === w && rt.height === h) return rt;
  rt?.destroy(true);
  const next = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' });
  return next;
}
