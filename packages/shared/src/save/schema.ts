import { RoomLayout } from '../world/layout';
import { placeMapFurniture } from '../world/generator';
import type { FurniturePlacement, ItemInstance, PlayerState, RoomInfo, RoomState, WorldState } from '../world/types';

/** Bump when the persisted shape changes, and add a migration below. */
export const SCHEMA_VERSION = 2;

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** Visit every item slot in a world (hotbars, carried and placed containers, ground items). */
function rewriteItems(w: WorldState, fn: (it: ItemInstance) => ItemInstance | null): void {
  const list = (items: (ItemInstance | null)[] | undefined) => items?.map((it) => (it ? fn(it) : null));
  const placement = (f: FurniturePlacement | null) => {
    if (f?.contents) f.contents = list(f.contents)!;
  };
  for (const p of Object.values(w.players ?? {}) as PlayerState[]) {
    const hb = p.hotbar;
    hb.main = hb.main && fn(hb.main);
    hb.off = hb.off && fn(hb.off);
    hb.armor = hb.armor && fn(hb.armor);
    hb.slots = list(hb.slots)!;
    placement(p.carrying);
  }
  for (const r of Object.values(w.rooms ?? {}) as RoomState[]) {
    r.furniture.forEach(placement);
    r.groundItems = r.groundItems.filter((g) => {
      const it = fn(g.item);
      if (it) g.item = it;
      return !!it;
    });
  }
}

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v2: shields removed; tool/roll `halves` became whole-unit `count`; braziers became furniture.
  1: (raw) => {
    const w = raw as unknown as WorldState;
    rewriteItems(w, (it) => {
      if (it.defId === 'wooden_shield' || it.defId === 'tower_shield') return null;
      if (typeof it.data.halves === 'number') {
        it.data.count = it.data.halves;
        delete it.data.halves;
      }
      return it;
    });
    for (const floor of Object.values(w.floors ?? {})) {
      for (const info of Object.values(floor.rooms) as RoomInfo[]) {
        const state = w.rooms?.[info.id];
        if (state) placeMapFurniture(new RoomLayout(info, state));
      }
    }
    return raw;
  },
};

export function migrate(raw: Record<string, unknown>): WorldState {
  let state = raw;
  let v = typeof state.schemaVersion === 'number' ? state.schemaVersion : 1;
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    state = m(state);
    v++;
    state.schemaVersion = v;
  }
  return state as unknown as WorldState;
}
