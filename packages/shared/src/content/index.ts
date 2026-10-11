import { CELL_H, CELL_W, TILE_PX } from '../core/constants';
import * as reg from './registry';
import type { CellCoord, LegendEntry, RoomTemplateDef } from './types';
import { defaultLegend } from './roomTemplates/legend';

import obstacleDefs from './obstacles';
import surfaceDefs from './surfaces';
import furnitureDefs from './furniture';
import projectileDefs from './projectiles';
import weaponDefs from './items/weapons';
import armorDefs from './items/armor';
import toolDefs from './items/tools';
import rollDefs from './items/rolls';
import pickupDefs from './items/pickups';
import kitDefs from './items/kits';
import healthLayerDefs from './healthLayers';
import enemyDefs from './enemies';
import bossDefs from './bosses';
import roomTemplateDefs from './roomTemplates';
import { isValidPivot } from '../world/furniture';

let registered = false;

/** Registers all built-in content exactly once, then validates cross references. */
export function registerAllContent(): void {
  if (registered) return;
  registered = true;
  reg.obstacles.registerAll(obstacleDefs);
  reg.surfaces.registerAll(surfaceDefs);
  reg.furniture.registerAll(furnitureDefs);
  reg.projectiles.registerAll(projectileDefs);
  for (const list of [weaponDefs, armorDefs, toolDefs, rollDefs, pickupDefs, kitDefs]) {
    reg.items.registerAll(list);
  }
  reg.healthLayers.registerAll(healthLayerDefs);
  reg.enemies.registerAll(enemyDefs);
  reg.enemies.registerAll(bossDefs);
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

/**
 * Map coordinates of the tile just inside every place a door could open: the middle of each outer
 * edge of each cell. Furniture is kept off them.
 */
function doorApproaches(cells: CellCoord[]): Set<string> {
  const has = new Set(cells.map((c) => `${c.cx},${c.cy}`));
  const out = new Set<string>();
  for (const c of cells) {
    const midX = c.cx * CELL_W + Math.floor(CELL_W / 2) - 1, midY = c.cy * CELL_H + Math.floor(CELL_H / 2) - 1;
    if (!has.has(`${c.cx},${c.cy - 1}`)) out.add(`${midX},${c.cy * CELL_H}`);
    if (!has.has(`${c.cx},${c.cy + 1}`)) out.add(`${midX},${c.cy * CELL_H + CELL_H - 3}`);
    if (!has.has(`${c.cx - 1},${c.cy}`)) out.add(`${c.cx * CELL_W},${midY}`);
    if (!has.has(`${c.cx + 1},${c.cy}`)) out.add(`${c.cx * CELL_W + CELL_W - 3},${midY}`);
  }
  return out;
}

export function validateContent(): string[] {
  const out: string[] = [];
  for (const f of reg.furniture.all()) {
    if (f.pivot && !isValidPivot(f.pivot, f.size.w, f.size.h)) out.push(`furniture ${f.id}: pivot must be a cell centre or grid corner inside its ${f.size.w}×${f.size.h} footprint`);
    const W = f.size.w * TILE_PX, H = f.size.h * TILE_PX;
    const at = f.light?.at;
    if (at && !(at.x >= 0 && at.y >= 0 && at.x <= W && at.y <= H)) out.push(`furniture ${f.id}: light.at must lie inside its ${W}×${H} px footprint`);
    for (const b of f.collision ?? []) {
      if (!(b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H)) out.push(`furniture ${f.id}: collision box ${JSON.stringify(b)} must lie inside its ${W}×${H} px footprint`);
    }
  }
  for (const t of reg.roomTemplates.all()) {
    const { w, h } = templateMapSize(t);
    if (t.map.length !== h) out.push(`template ${t.id}: expected ${h} rows, got ${t.map.length}`);
    t.map.forEach((row, i) => {
      if (row.length !== w) out.push(`template ${t.id}: row ${i} has width ${row.length}, expected ${w}`);
    });
    const legend = legendFor(t);
    const approaches = doorApproaches(t.cells);
    t.map.forEach((row, my) => {
      for (let mx = 0; mx < row.length; mx++) {
        const ch = row[mx]!;
        const e = legend[ch];
        if (!e) {
          out.push(`template ${t.id}: '${ch}' at ${mx},${my} isn't in its legend`);
          continue;
        }
        if ('obstacle' in e && !reg.obstacles.has(e.obstacle)) out.push(`template ${t.id}: unknown obstacle ${e.obstacle}`);
        if ('enemy' in e && !reg.enemies.has(e.enemy)) out.push(`template ${t.id}: unknown enemy ${e.enemy}`);
        if (!('furniture' in e)) continue;
        const def = reg.furniture.tryGet(e.furniture);
        if (!def) {
          out.push(`template ${t.id}: unknown furniture ${e.furniture}`);
          continue;
        }
        // Furniture mustn't stand where a door may open later (the tile inside every possible door).
        const size = (e.rot ?? 0) % 2 ? { w: def.size.h, h: def.size.w } : def.size;
        for (let y = my; y < my + size.h; y++) {
          for (let x = mx; x < mx + size.w; x++) {
            if (x >= w || y >= h) out.push(`template ${t.id}: ${e.furniture} at ${mx},${my} sticks out of the map`);
            else if (x !== mx || y !== my) {
              const under = legend[t.map[y]?.[x] ?? ''];
              if (!under || !('floor' in under)) out.push(`template ${t.id}: ${e.furniture} at ${mx},${my} needs plain floor under its whole footprint`);
            }
            if (approaches.has(`${x},${y}`)) out.push(`template ${t.id}: ${e.furniture} at ${mx},${my} is in front of a possible door (${x},${y})`);
          }
        }
        for (const c of e.contents ?? []) {
          if (!c) continue;
          for (const id of typeof c === 'string' ? [c] : [c.id, ...c.contents]) if (!reg.items.has(id)) out.push(`template ${t.id}: unknown item ${id}`);
        }
      }
    });
    if ((t.difficulty ?? 0) < 0) out.push(`template ${t.id}: difficulty can't be negative`);
    for (const s of [t.floorSurface, t.wallSurface]) if (s && !reg.surfaces.has(s)) out.push(`template ${t.id}: unknown surface ${s}`);
  }
  for (const e of reg.enemies.all()) {
    if (!(e.difficulty > 0)) out.push(`enemy ${e.id}: difficulty must be positive`);
    for (const d of e.loot ?? []) {
      const sum = d.entries.reduce((s, x) => s + x.chance, 0);
      if (sum > 1 + 1e-6) out.push(`enemy ${e.id}: loot entry chances sum to ${sum} > 1`);
      for (const x of d.entries) if ('item' in x && !reg.items.has(x.item)) out.push(`enemy ${e.id}: unknown loot item ${x.item}`);
    }
  }
  for (const i of reg.items.all()) {
    if (i.kind === 'weapon' && i.attack.type === 'ranged' && !reg.projectiles.has(i.attack.projectile)) {
      out.push(`item ${i.id}: unknown projectile ${i.attack.projectile}`);
    }
    if (i.kind === 'roll' && !reg.surfaces.has(i.surface)) out.push(`item ${i.id}: unknown surface ${i.surface}`);
    if (i.kind === 'weapon' && i.tool && !(i.tool.uses > 0)) out.push(`item ${i.id}: tool uses must be positive`);
  }
  for (const o of reg.obstacles.all()) {
    if (o.autotile && !o.connectGroup) out.push(`obstacle ${o.id}: autotiled walls need a connectGroup`);
  }
  return out;
}
