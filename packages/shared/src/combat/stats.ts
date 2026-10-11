import type { StatMod, StatName } from '../content/types';

export const BASE_STATS: Record<StatName, number> = {
  moveSpeed: 4.5,
  damage: 0,
  cooldown: 1,
  projectileSpeed: 1,
  extraProjectiles: 0,
  meleeRange: 0,
  maxRedHalves: 0,
  knockback: 1,
};

/**
 * Base values plus stacked modifiers grouped by source (the armor, "shield raised", …).
 * value = (base + Σadd) × Πmul
 */
export class Stats {
  private sources = new Map<string, StatMod[]>();

  constructor(private base: Record<StatName, number> = { ...BASE_STATS }) {}

  set(source: string, mods: StatMod[] | undefined): void {
    if (!mods || mods.length === 0) this.sources.delete(source);
    else this.sources.set(source, mods);
  }

  clear(source: string): void {
    this.sources.delete(source);
  }

  get(stat: StatName): number {
    let add = 0;
    let mul = 1;
    for (const mods of this.sources.values()) {
      for (const m of mods) {
        if (m.stat !== stat) continue;
        add += m.add ?? 0;
        mul *= m.mul ?? 1;
      }
    }
    return (this.base[stat] + add) * mul;
  }
}
