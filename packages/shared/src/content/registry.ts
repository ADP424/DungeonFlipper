import type {
  EnemyDef, FurnitureDef, HealthLayerDef, ItemDef, ObstacleDef,
  ProjectileDef, RoomTemplateDef, SurfaceDef,
} from './types';

/** A string-keyed registry of content defs. */
export class Registry<T extends { id: string }> {
  private map = new Map<string, T>();
  constructor(readonly kind: string) {}

  register(def: T): T {
    if (this.map.has(def.id)) throw new Error(`Duplicate ${this.kind} id "${def.id}"`);
    this.map.set(def.id, def);
    return def;
  }

  registerAll(defs: readonly T[]): void {
    for (const d of defs) this.register(d);
  }

  get(id: string): T {
    const d = this.map.get(id);
    if (!d) throw new Error(`Unknown ${this.kind} "${id}"`);
    return d;
  }

  tryGet(id: string | null | undefined): T | undefined {
    return id == null ? undefined : this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  all(): T[] {
    return [...this.map.values()];
  }
}

export const items = new Registry<ItemDef>('item');
export const enemies = new Registry<EnemyDef>('enemy');
export const obstacles = new Registry<ObstacleDef>('obstacle');
export const furniture = new Registry<FurnitureDef>('furniture');
export const surfaces = new Registry<SurfaceDef>('surface');
export const projectiles = new Registry<ProjectileDef>('projectile');
export const roomTemplates = new Registry<RoomTemplateDef>('room template');
export const healthLayers = new Registry<HealthLayerDef>('health layer');
