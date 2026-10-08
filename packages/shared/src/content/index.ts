import { CELL_H, CELL_W } from '../core/constants';
import * as reg from './registry';
import type { LegendEntry, RoomTemplateDef } from './types';
import { defaultLegend } from './roomTemplates/legend';

import obstacleDefs from './obstacles';
import surfaceDefs from './surfaces';
import furnitureDefs from './furniture';
import projectileDefs from './projectiles';
import weaponDefs from './items/weapons';
import armorDefs from './items/armor';
import toolDefs from './items/tools';
import rollDefs from './items/rolls';
import passiveDefs from './items/passives';
import pickupDefs from './items/pickups';
import healthLayerDefs from './healthLayers';
import enemyDefs from './enemies';
import bossDefs from './bosses';
import lootTableDefs from './lootTables';
import roomTemplateDefs from './roomTemplates';

let registered = false;

/** Registers all built-in content exactly once, then validates cross references. */
export function registerAllContent(): void {
  if (registered) return;
  registered = true;
  reg.obstacles.registerAll(obstacleDefs);
  reg.surfaces.registerAll(surfaceDefs);
  reg.furniture.registerAll(furnitureDefs);
  reg.projectiles.registerAll(projectileDefs);
  for (const list of [weaponDefs, armorDefs, toolDefs, rollDefs, passiveDefs, pickupDefs]) {
    reg.items.registerAll(list);
  }
  reg.healthLayers.registerAll(healthLayerDefs);
  reg.enemies.registerAll(enemyDefs);
  reg.enemies.registerAll(bossDefs);
  reg.lootTables.registerAll(lootTableDefs);
  reg.roomTemplates.registerAll(roomTemplateDefs);
  const problems = validateContent();
  if (problems.length) throw new Error('Content validation failed:\n' + problems.join('\n'));
}

export function legendFor(t: RoomTemplateDef): Record<string, LegendEntry> {
  return t.legend ? { ...defaultLegend, ...t.legend } : defaultLegend;
}

/** Expected template map size: the shape's bounding box minus the outer wall ring. */
export function templateMapSize(t: RoomTemplateDef): { w: number; h: number } {
  const maxCx = Math.max(...t.cells.map((c) => c.cx));
  const maxCy = Math.max(...t.cells.map((c) => c.cy));
  return { w: (maxCx + 1) * CELL_W - 2, h: (maxCy + 1) * CELL_H - 2 };
}

export function validateContent(): string[] {
  const out: string[] = [];
  for (const t of reg.roomTemplates.all()) {
    const { w, h } = templateMapSize(t);
    if (t.map.length !== h) out.push(`template ${t.id}: expected ${h} rows, got ${t.map.length}`);
    t.map.forEach((row, i) => {
      if (row.length !== w) out.push(`template ${t.id}: row ${i} has width ${row.length}, expected ${w}`);
    });
    const legend = legendFor(t);
    for (const row of t.map) {
      for (const ch of row) {
        const e = legend[ch];
        if (!e) continue;
        if ('obstacle' in e && !reg.obstacles.has(e.obstacle)) out.push(`template ${t.id}: unknown obstacle ${e.obstacle}`);
        if ('enemy' in e && !reg.enemies.has(e.enemy)) out.push(`template ${t.id}: unknown enemy ${e.enemy}`);
        if ('furniture' in e && !reg.furniture.has(e.furniture)) out.push(`template ${t.id}: unknown furniture ${e.furniture}`);
      }
    }
    for (const f of t.furniture ?? []) {
      if (!reg.furniture.has(f.def)) out.push(`template ${t.id}: unknown furniture ${f.def}`);
      for (const c of f.contents ?? []) if (c && !reg.items.has(c)) out.push(`template ${t.id}: unknown item ${c}`);
    }
  }
  for (const lt of reg.lootTables.all()) {
    for (const d of lt.drops) {
      const sum = d.entries.reduce((s, e) => s + e.chance, 0);
      if (sum > 1 + 1e-6) out.push(`loot table ${lt.id}: entry chances sum to ${sum} > 1`);
      for (const e of d.entries) {
        if ('item' in e && !reg.items.has(e.item)) out.push(`loot table ${lt.id}: unknown item ${e.item}`);
        if ('furniture' in e && !reg.furniture.has(e.furniture)) out.push(`loot table ${lt.id}: unknown furniture ${e.furniture}`);
      }
    }
  }
  for (const e of reg.enemies.all()) {
    if (e.lootTable && !reg.lootTables.has(e.lootTable)) out.push(`enemy ${e.id}: unknown loot table ${e.lootTable}`);
  }
  for (const i of reg.items.all()) {
    if (i.kind === 'weapon' && i.attack.type === 'ranged' && !reg.projectiles.has(i.attack.projectile)) {
      out.push(`item ${i.id}: unknown projectile ${i.attack.projectile}`);
    }
    if (i.kind === 'roll' && !reg.surfaces.has(i.surface)) out.push(`item ${i.id}: unknown surface ${i.surface}`);
  }
  for (const o of reg.obstacles.all()) {
    if (o.autotile && !o.connectGroup) out.push(`obstacle ${o.id}: autotiled walls need a connectGroup`);
  }
  return out;
}
