import type { FurniturePlacement, ItemInstance, PlayerState, RoomState, WorldState } from '../world/types';

/** Bump when the persisted shape changes, and add a migration below. */
export const SCHEMA_VERSION = 8;

/**
 * Saves older than this can't be upgraded and are discarded (a new game starts). v7 renamed every
 * content id to the Backrooms theme; while the game is in development, saves are wiped between
 * roadmap phases rather than carried through migrations.
 */
export const MIN_SAVE_VERSION = 8;

export class SaveTooOldError extends Error {}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** Visit every item slot in a world (hotbars, carried and placed containers, ground items). For migrations. */
export function rewriteItems(w: WorldState, fn: (it: ItemInstance) => ItemInstance | null): void {
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

/** migrations[n] upgrades a version-n save to version n+1 (n ≥ MIN_SAVE_VERSION). */
const migrations: Record<number, Migration> = {};

/** Upgrade a raw save to the current schema. Throws `SaveTooOldError` for saves older than MIN_SAVE_VERSION. */
export function migrate(raw: Record<string, unknown>): WorldState {
  let state = raw;
  let v = typeof state.schemaVersion === 'number' ? state.schemaVersion : 1;
  if (v < MIN_SAVE_VERSION) throw new SaveTooOldError(`Save version ${v} is older than ${MIN_SAVE_VERSION}`);
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    state = m(state);
    v++;
    state.schemaVersion = v;
  }
  return state as unknown as WorldState;
}
