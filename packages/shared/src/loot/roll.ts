import type { Rng } from '../core/rng';
import type { LootDrop, LootEntry } from '../content/types';

export type LootResult =
  | { kind: 'item'; item: string }
  | { kind: 'cash'; amount: number };

/**
 * Roll an enemy's loot:
 *  - every drop rolls independently against its `chance`;
 *  - a passing drop picks exactly one of its entries by their individual chances;
 *  - leftover probability (entries summing below 1) means that drop yields nothing.
 */
export function rollLoot(drops: LootDrop[], rng: Rng): LootResult[] {
  const out: LootResult[] = [];
  for (const drop of drops) {
    if (!(rng.next() < drop.chance)) continue;
    const entry = pickEntry(drop.entries, rng.next());
    if (!entry) continue;
    out.push(resolveEntry(entry, rng));
  }
  return out;
}

/** Choose one entry using a single uniform roll `r` in [0,1); returns undefined for the leftover. */
export function pickEntry(entries: LootEntry[], r: number): LootEntry | undefined {
  let acc = 0;
  for (const e of entries) {
    acc += e.chance;
    if (r < acc) return e;
  }
  return undefined;
}

function resolveEntry(e: LootEntry, rng: Rng): LootResult {
  if ('item' in e) return { kind: 'item', item: e.item };
  const amount = Array.isArray(e.cash) ? rng.int(e.cash[0], e.cash[1]) : e.cash;
  return { kind: 'cash', amount };
}
