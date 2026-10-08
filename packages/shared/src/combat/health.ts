import { healthLayers } from '../content/registry';

/** One layer of health, in half-heart units. */
export interface HealthLayer {
  kind: string;
  current: number;
  max: number;
  /** Item instance uid that provides this layer (armor). When it empties, the item breaks. */
  boundItemUid?: string;
}

export interface DamageResult {
  absorbed: number;
  /** Item uids whose bound layer emptied this hit. */
  brokenItems: string[];
  /** True when every layer is empty. */
  dead: boolean;
}

/**
 * Ordered health layers (red hearts, armor, and any future kinds like soul or cursed hearts).
 * Damage drains the highest-priority layer first. New layer kinds only need a HealthLayerDef.
 */
export class HealthStack {
  layers: HealthLayer[] = [];

  constructor(layers: HealthLayer[] = []) {
    for (const l of layers) this.add(l);
  }

  add(layer: HealthLayer): void {
    this.layers.push(layer);
    this.sort();
  }

  remove(pred: (l: HealthLayer) => boolean): void {
    this.layers = this.layers.filter((l) => !pred(l));
  }

  get(kind: string): HealthLayer | undefined {
    return this.layers.find((l) => l.kind === kind);
  }

  private sort(): void {
    const prio = (l: HealthLayer) => healthLayers.tryGet(l.kind)?.priority ?? 0;
    this.layers.sort((a, b) => prio(b) - prio(a));
  }

  damage(amount: number): DamageResult {
    let left = amount;
    const broken: string[] = [];
    for (const layer of this.layers) {
      if (left <= 0) break;
      const take = Math.min(layer.current, left);
      layer.current -= take;
      left -= take;
      const def = healthLayers.tryGet(layer.kind);
      if (layer.current <= 0 && layer.boundItemUid && def?.breaksBoundItem) broken.push(layer.boundItemUid);
    }
    // Emptied, item-bound layers disappear (the armor broke).
    this.layers = this.layers.filter((l) => !(l.current <= 0 && l.boundItemUid && broken.includes(l.boundItemUid)));
    return { absorbed: amount - left, brokenItems: broken, dead: this.total() <= 0 };
  }

  heal(kind: string, amount: number): number {
    const l = this.get(kind);
    if (!l) return 0;
    const before = l.current;
    l.current = Math.min(l.max, l.current + amount);
    return l.current - before;
  }

  total(): number {
    return this.layers.reduce((s, l) => s + l.current, 0);
  }
}
