import { registry, type ItemInstance } from '@df/shared';
import type { Game } from '../Game';

export interface ToolCheck {
  ok: boolean;
  /** Cost in uses (deducted from the item's `count`). */
  cost: number;
  reason?: string;
}

/**
 * Renovation actions performed by main-hand tools and rolls on a target tile in an owned room.
 * Walls cost by height (low 1, tall 2); floor-level work costs 1 per tile.
 */
export interface ToolAction {
  check(game: Game, x: number, y: number, params: Record<string, unknown>, item: ItemInstance): ToolCheck;
  apply(game: Game, x: number, y: number, params: Record<string, unknown>, item: ItemInstance): void;
}

const no = (reason: string): ToolCheck => ({ ok: false, cost: 0, reason });

function entityOnTile(game: Game, x: number, y: number): boolean {
  const all = [game.player, ...game.room.enemies];
  return all.some((e) => e.x + e.radius > x && e.x - e.radius < x + 1 && e.y + e.radius > y && e.y - e.radius < y + 1);
}

export const toolActions: Record<string, ToolAction> = {
  demolish: {
    check(game, x, y) {
      const o = game.room.layout.obstacleAt(x, y);
      if (!o) return no('Nothing to demolish');
      if (!o.renovate?.includes('demolish')) return no(`Can't demolish ${o.name}`);
      return { ok: true, cost: o.height === 'short' ? 1 : 2 };
    },
    apply(game, x, y) {
      game.setTile(x, y, null);
      game.burst(x + 0.5, y + 0.5, 0x9a8a7a, 10);
    },
  },

  fill: {
    check(game, x, y) {
      const o = game.room.layout.obstacleAt(x, y);
      if (!o?.renovate?.includes('fill')) return no('Use planks on a pit');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params) {
      game.setTile(x, y, null);
      game.setSurface(x, y, 'floor', String(params.surface ?? 'wood_rough'));
      game.burst(x + 0.5, y + 0.5, 0x9a6a3c, 8);
    },
  },

  buildWall: {
    check(game, x, y, params) {
      const L = game.room.layout;
      const id = L.obstacleIdAt(x, y);
      if (id === params.short) return { ok: true, cost: 1 };
      if (id) return no('Something is already there');
      if (!L.isBuildable(x, y)) return no("Can't build here");
      if (entityOnTile(game, x, y)) return no('Something is in the way');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params) {
      const id = game.room.layout.obstacleIdAt(x, y);
      game.setTile(x, y, id === params.short ? String(params.tall) : String(params.short));
      game.burst(x + 0.5, y + 0.5, 0xd8cfbf, 6);
    },
  },

  applySurface: {
    check(game, x, y, params) {
      const surface = registry.surfaces.get(String(params.surface));
      const L = game.room.layout;
      const o = L.obstacleAt(x, y);
      if (surface.applies === 'wall') {
        if (!o?.isWall) return no('Wallpaper goes on walls');
        if (L.state.wallSurfaces[`${x},${y}`] === surface.id) return no('Already papered');
        return { ok: true, cost: o.height === 'short' ? 1 : 2 };
      }
      const kind = L.kindAt(x, y);
      if ((kind !== 'floor' && kind !== 'door') || o) return no('Flooring goes on open floor');
      if (L.state.floorSurfaces[`${x},${y}`] === surface.id) return no('Already covered');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params) {
      const surface = registry.surfaces.get(String(params.surface));
      game.setSurface(x, y, surface.applies, surface.id);
    },
  },
};

/** Resolve the action + params for a main-hand item, if it's a tool or roll. */
export function actionFor(item: ItemInstance | null): { action: ToolAction; params: Record<string, unknown> } | null {
  if (!item) return null;
  const def = registry.items.get(item.defId);
  if (def.kind === 'tool') {
    const action = toolActions[def.action.id];
    return action ? { action, params: def.action.params ?? {} } : null;
  }
  if (def.kind === 'roll') return { action: toolActions.applySurface!, params: { surface: def.surface } };
  return null;
}
