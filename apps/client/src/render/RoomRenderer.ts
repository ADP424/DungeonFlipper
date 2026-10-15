import { Container, Sprite, type Texture } from 'pixi.js';
import {
  BARRICADE_TIERS, FACINGS, TILE_PX, solidBoxes, footprint, registry, wallMask, type FurniturePlacement, type RoomLayout,
} from '@df/shared';
import { hasArt, opaqueAt, tex } from '../engine/assets';

/**
 * Builds the static visuals of a room: what lies flat (floor, surfaces, flat obstacles) in `floor`, and
 * what stands up (walls, barricades, furniture) in the entity layer, sorted in depth with the actors.
 */
export class RoomRenderer {
  readonly floor = new Container();
  private standing: Sprite[] = [];
  readonly furnitureViews = new Map<string, Container>();

  constructor(private layout: RoomLayout, private entityLayer: Container) {
    this.rebuild();
  }

  rebuild(): void {
    this.floor.removeChildren().forEach((c) => c.destroy());
    this.clearStanding();
    const L = this.layout;
    const st = L.state;
    for (const { x, y, kind } of L.tiles()) {
      const obs = L.obstacleAt(x, y);
      const px = x * TILE_PX, py = y * TILE_PX;
      const tall = obs?.height === 'tall';
      if (!tall) {
        const surf = L.floorSurfaceAt(x, y);
        this.floor.addChild(this.sprite(registry.surfaces.tryGet(surf)?.sprite ?? `floor/${surf}`, px, py));
        if (kind === 'door') {
          const b = L.barricadeAt(x, y);
          if (b) {
            this.stand(`barricades/tier_${b.tier}`, x, y, y + 1);
            const frac = b.hp / BARRICADE_TIERS[b.tier]!.hp;
            if (frac < 0.66) this.stand(`barricades/cracks_${frac < 0.33 ? 2 : 1}`, x, y, y + 1);
          }
        }
      }
      if (!obs) continue;
      if (obs.height === 'none') {
        let key = obs.sprite;
        if (obs.id === 'missing_floor' && L.obstacleIdAt(x, y - 1) !== 'missing_floor') key = 'obstacles/missing_floor_top';
        this.floor.addChild(this.sprite(key, px, py));
        continue;
      }
      const wallSurf = L.wallSurfaceAt(x, y);
      const back = L.backEdge(x, y);
      if (obs.autotile) {
        // Faces point at whichever sides are open; shadows come from the lights (Shadows.ts).
        const key = `auto:${obs.autotile.set}:${wallMask(L, x, y)}`;
        this.stand(wallSurf ? `${key}:${wallSurf}` : key, x, y, back);
      } else if (wallSurf) {
        this.stand(tall ? `wall:${wallSurf}` : `wallshort:${wallSurf}`, x, y, back);
      } else {
        this.stand(obs.sprite, x, y, back);
      }
    }
    this.syncFurniture();
  }

  private sprite(key: string, x: number, y: number): Sprite {
    const s = new Sprite(tex(key));
    s.position.set(x, y);
    return s;
  }

  /**
   * Something standing on a tile, sorted in depth at `sort`. A wall sorts at its back edge
   * (`RoomLayout.backEdge`): only what is behind that is behind the wall (and drawn under it); a body
   * beside it, whose art overlaps its side, is not. A barricade is walked through, so it sorts at its front.
   */
  private stand(key: string, x: number, y: number, sort: number): void {
    const s = this.sprite(key, x * TILE_PX, y * TILE_PX);
    s.zIndex = sort;
    this.standing.push(s);
    this.entityLayer.addChild(s);
  }

  private clearStanding(): void {
    for (const s of this.standing) s.destroy();
    this.standing = [];
  }

  /** Ensure a view exists for every placed furniture and none for removed ones. */
  syncFurniture(): void {
    const live = new Set(this.layout.state.furniture.map((f) => f.uid));
    for (const [uid, view] of this.furnitureViews) {
      if (!live.has(uid)) {
        view.destroy({ children: true });
        this.furnitureViews.delete(uid);
      }
    }
    for (const f of this.layout.state.furniture) {
      let v = this.furnitureViews.get(f.uid);
      if (v && (v as Container & { _key?: string })._key !== placementKey(f)) {
        v.destroy({ children: true });
        v = undefined;
      }
      if (!v) {
        v = buildFurnitureView(f.defId, f.rot);
        (v as Container & { _key?: string })._key = placementKey(f);
        this.furnitureViews.set(f.uid, v);
        this.entityLayer.addChild(v);
      }
      const def = registry.furniture.get(f.defId);
      const { w, h } = footprint(def, f.rot);
      // Small pieces on a tabletop stand on its top surface and draw just in front of it.
      const base = this.layout.onTopOf(f);
      v.position.set((f.x + w / 2) * TILE_PX, (f.y + h / 2) * TILE_PX - tabletopLift(base));
      v.zIndex = furnitureDepth(f, base);
    }
  }

  destroy(): void {
    for (const v of this.furnitureViews.values()) v.destroy({ children: true });
    this.furnitureViews.clear();
    this.clearStanding();
    this.floor.destroy({ children: true });
  }
}

const placementKey = (f: FurniturePlacement) => `${f.defId}:${f.rot}`;

/** How far a piece on a tabletop is raised (px): the table's top surface. */
export function tabletopLift(base: FurniturePlacement | undefined): number {
  return base ? registry.furniture.get(base.defId).tabletop ?? 0 : 0;
}

/**
 * Where a piece sorts in depth among actors (who sort by their feet): the back edge of its solid boxes,
 * so you're drawn behind it only when you're behind its base, not beside it. A piece on a tabletop
 * draws just in front of its table.
 */
export function furnitureDepth(f: FurniturePlacement, base?: FurniturePlacement): number {
  if (base) return furnitureDepth(base) + 0.01;
  return Math.min(...solidBoxes(registry.furniture.get(f.defId), f).map((b) => b.y));
}

/** Whether a world point (tiles) is on a visible pixel of a piece's art (for picking it with the mouse). */
export function furnitureArtHit(f: FurniturePlacement, base: FurniturePlacement | undefined, wx: number, wy: number): boolean {
  const { w, h } = footprint(registry.furniture.get(f.defId), f.rot);
  const art = furnitureArt(f.defId, f.rot);
  const { width, height } = tex(art.key);
  let px = Math.floor(wx * TILE_PX - ((f.x + w / 2) * TILE_PX - width / 2));
  const py = Math.floor(wy * TILE_PX - ((f.y + h) * TILE_PX - tabletopLift(base) - height));
  if (art.mirror) px = width - 1 - px;
  return opaqueAt(art.key, px, py);
}

/**
 * The art for a piece of furniture in a facing. Each piece has three views: `<sprite>/south`, `north` and
 * `side` (drawn facing east; facing west mirrors it). A missing north or side uses south.
 */
export function furnitureArt(defId: string, rot: number): { key: string; mirror: boolean } {
  const base = registry.furniture.get(defId).sprite;
  const facing = FACINGS[((rot % 4) + 4) % 4]!;
  const view = facing === 'east' || facing === 'west' ? 'side' : facing;
  const key = `${base}/${view}`;
  if (!hasArt(key)) return { key: `${base}/south`, mirror: false };
  return { key, mirror: facing === 'west' };
}

/**
 * A furniture view centred on its footprint in a facing. The facing's art stands on the footprint's
 * bottom edge, centred, so a piece drawn taller (or wider) than its footprint reaches past it. Images
 * are never rotated: each facing is drawn.
 */
export function buildFurnitureView(defId: string, rot: number, texture: (key: string) => Texture = tex, tint?: number): Container {
  const { h } = footprint(registry.furniture.get(defId), rot);
  const art = furnitureArt(defId, rot);
  const c = new Container();
  const s = new Sprite(texture(art.key));
  s.anchor.set(0.5, 1);
  s.position.set(0, (h * TILE_PX) / 2);
  if (art.mirror) s.scale.x = -1;
  if (tint !== undefined) s.tint = tint;
  c.addChild(s);
  return c;
}
