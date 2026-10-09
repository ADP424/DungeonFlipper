import { MAX_STACK } from '../core/constants';
import { uid } from '../core/ids';
import { items } from '../content/registry';
import type { ItemDef, ItemKind } from '../content/types';
import type { Hotbar, HotbarSlotId, ItemInstance } from './types';

/** Create a fresh item instance with its per-instance data initialised from the def. */
export function createItem(defId: string, id: string = uid(), data: ItemInstance['data'] = {}): ItemInstance {
  const def = items.get(defId);
  const d: ItemInstance['data'] = {};
  if (def.kind === 'armor') d.armorHalves = def.halves;
  if (def.kind === 'tool') d.count = def.uses;
  if (def.kind === 'weapon' && def.tool) d.count = def.tool.uses;
  if (def.kind === 'roll') d.count = def.coverage;
  const inst: ItemInstance = { uid: id, defId, data: { ...d, ...data } };
  if (def.kind === 'kit') inst.contents = Array(def.slots).fill(null);
  return inst;
}

/** What a toolkit carries: renovation gear (tools, rolls, and weapons that double as tools). */
export function kitAccepts(inst: ItemInstance | null): boolean {
  if (!inst) return true;
  const def = itemDef(inst);
  return def.kind === 'tool' || def.kind === 'roll' || (def.kind === 'weapon' && !!def.tool);
}

export function itemDef(inst: ItemInstance): ItemDef {
  return items.get(inst.defId);
}

/** Anything usable goes in either hand: left click uses the main hand, right click the off hand. */
const slotKinds: Record<'main' | 'off' | 'armor', ItemKind[]> = {
  main: ['weapon', 'tool', 'roll'],
  off: ['weapon', 'tool', 'roll'],
  armor: ['armor'],
};

/** Whether an item may sit in a hotbar slot. Storage slots take anything that can live in the hotbar. */
export function canHold(slot: HotbarSlotId, inst: ItemInstance | null): boolean {
  if (!inst) return true;
  const kind = itemDef(inst).kind;
  if (kind === 'passive' || kind === 'pickup') return false;
  if (typeof slot === 'number') return true;
  return slotKinds[slot].includes(kind);
}

/** Remaining uses / coverage, for tools and rolls. */
export function countLeft(inst: ItemInstance): number {
  return typeof inst.data.count === 'number' ? inst.data.count : 0;
}

/**
 * Tools and rolls stack: instances of the same def merge their counts, up to MAX_STACK. Worn items
 * (a pried-off barricade keeps its remaining `hp`) only stack with identically worn ones.
 */
export function isStackable(inst: ItemInstance): boolean {
  const kind = itemDef(inst).kind;
  return kind === 'tool' || kind === 'roll';
}

export function canStack(a: ItemInstance | null, b: ItemInstance | null): boolean {
  return !!a && !!b && a.defId === b.defId && isStackable(a) && a.data.hp === b.data.hp;
}

/**
 * Move as much of `from`'s count onto `into` as fits (both must stack). Mutates both and returns
 * what is left in `from` (0 when it was fully absorbed).
 */
export function mergeStack(into: ItemInstance, from: ItemInstance): number {
  const moved = Math.max(0, Math.min(countLeft(from), MAX_STACK - countLeft(into)));
  into.data.count = countLeft(into) + moved;
  from.data.count = countLeft(from) - moved;
  return countLeft(from);
}

/**
 * Put an item in the hotbar (mutating both): merge into matching stacks first, then the matching
 * empty equip slot, then storage. Returns false if anything is left over; the item then keeps the
 * remaining count.
 */
export function addToHotbar(hb: Hotbar, inst: ItemInstance): boolean {
  if (isStackable(inst)) {
    for (const s of [hb.main, hb.off, ...hb.slots]) if (canStack(s, inst) && mergeStack(s!, inst) === 0) return true;
  }
  const kind = itemDef(inst).kind;
  if (kind === 'armor' && !hb.armor) { hb.armor = inst; return true; }
  if ((kind === 'weapon' || kind === 'tool' || kind === 'roll') && !hb.main) { hb.main = inst; return true; }
  const i = hb.slots.findIndex((s) => !s);
  if (i < 0) return false;
  hb.slots[i] = inst;
  return true;
}
