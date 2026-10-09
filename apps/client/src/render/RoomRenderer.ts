import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  BARRICADE_TIERS, TILE_PX, footprint, hashString, registry, tileKey, wallMask, type FurniturePlacement, type RoomLayout,
} from '@df/shared';
import { tex } from '../engine/assets';

const FLOOR_KEY = 'td:0';

/** Builds the static visuals of a room (floor, surfaces, obstacles, walls) and furniture views. */
export class RoomRenderer {
  readonly floor = new Container();
  readonly walls = new Container();
  readonly furnitureViews = new Map<string, Container>();

  constructor(private layout: RoomLayout, private entityLayer: Container) {
    this.rebuild();
  }

  rebuild(): void {
    this.floor.removeChildren().forEach((c) => c.destroy());
    this.walls.removeChildren().forEach((c) => c.destroy());
    const L = this.layout;
    const st = L.state;
    for (const { x, y, kind } of L.tiles()) {
      const k = tileKey(x, y);
      const obs = L.obstacleAt(x, y);
      const px = x * TILE_PX, py = y * TILE_PX;
      const tall = obs?.height === 'tall';
      if (!tall) {
        const f = this.sprite(FLOOR_KEY, px, py);
        const h = hashString(k) % 100;
        const shade = 0.93 + (h / 100) * 0.07;
        const c = Math.floor(255 * shade);
        f.tint = (c << 16) | (c << 8) | c;
        this.floor.addChild(f);
        this.floor.addChild(this.sprite(`surf:${L.floorSurfaceAt(x, y)}`, px, py));
        if (kind === 'door') {
          const g = new Graphics().rect(px, py, TILE_PX, TILE_PX).fill({ color: 0x000000, alpha: 0.25 });
          this.floor.addChild(g);
          const b = L.barricadeAt(x, y);
          if (b) {
            this.walls.addChild(this.sprite(`proc:barricade:${b.tier}`, px, py));
            const frac = b.hp / BARRICADE_TIERS[b.tier]!.hp;
            if (frac < 0.66) this.walls.addChild(this.sprite(`proc:cracks:${frac < 0.33 ? 2 : 1}`, px, py));
          }
        }
      }
      if (!obs) continue;
      if (obs.height === 'none') {
        let key = obs.sprite;
        if (obs.id === 'missing_floor' && L.obstacleIdAt(x, y - 1) !== 'missing_floor') key = 'proc:hole_top';
        this.floor.addChild(this.sprite(key, px, py));
        continue;
      }
      const wallSurf = L.wallSurfaceAt(x, y);
      if (obs.autotile) {
        // Faces point at whichever sides are open; shadows come from the lights (Shadows.ts).
        const key = `auto:${obs.autotile.set}:${wallMask(L, x, y)}`;
        this.walls.addChild(this.sprite(wallSurf ? `${key}:${wallSurf}` : key, px, py));
      } else if (wallSurf) {
        this.walls.addChild(this.sprite(tall ? `wall:${wallSurf}` : `wallshort:${wallSurf}`, px, py));
      } else {
        this.walls.addChild(this.sprite(obs.sprite, px, py));
      }
    }
    this.syncFurniture();
  }

  private sprite(key: string, x: number, y: number): Sprite {
    const s = new Sprite(tex(key));
    s.position.set(x, y);
    return s;
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
      const lift = base ? registry.furniture.get(base.defId).tabletop ?? 0 : 0;
      v.position.set((f.x + w / 2) * TILE_PX, (f.y + h / 2) * TILE_PX - lift);
      v.zIndex = base ? base.y + footprint(registry.furniture.get(base.defId), base.rot).h - 0.49 : f.y + h - 0.5;
    }
  }

  destroy(): void {
    for (const v of this.furnitureViews.values()) v.destroy({ children: true });
    this.furnitureViews.clear();
    this.floor.destroy({ children: true });
    this.walls.destroy({ children: true });
  }
}

const placementKey = (f: FurniturePlacement) => `${f.defId}:${f.rot}`;

/** A furniture view centred on its footprint, rotated in quarter turns. */
export function buildFurnitureView(defId: string, rot: number, texture: (key: string) => Texture = tex, tint?: number): Container {
  const def = registry.furniture.get(defId);
  const c = new Container();
  const inner = new Container();
  const tiles = typeof def.sprite === 'string' ? [[def.sprite]] : def.sprite.tiles;
  tiles.forEach((row, ry) =>
    row.forEach((key, rx) => {
      if (!key) return;
      const s = new Sprite(texture(key));
      s.position.set(rx * TILE_PX, ry * TILE_PX);
      if (tint !== undefined) s.tint = tint;
      inner.addChild(s);
    }),
  );
  inner.pivot.set((def.size.w * TILE_PX) / 2, (def.size.h * TILE_PX) / 2);
  inner.rotation = (rot * Math.PI) / 2;
  c.addChild(inner);
  return c;
}
