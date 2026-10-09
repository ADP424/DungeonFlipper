import { BARRICADE_TIERS, isOwnedBy, registry, type ItemInstance, type UtilityKind } from '@df/shared';
import type { Game } from '../Game';

export interface ToolCheck {
  ok: boolean;
  /** Cost in uses (deducted from the item's `count`). */
  cost: number;
  reason?: string;
}

/**
 * Renovation actions performed by tools and rolls on a target tile, in any room: the player may do
 * anything they physically could, wise or not. Walls cost by height (low 1, tall 2); floor-level
 * work costs 1 per tile.
 */
export interface ToolAction {
  /** Keep applying while the button is held and the target moves onto a new tile (laying a run). */
  repeat?: boolean;
  check(game: Game, x: number, y: number, params: Record<string, unknown>, item: ItemInstance): ToolCheck;
  apply(game: Game, x: number, y: number, params: Record<string, unknown>, item: ItemInstance): void;
}

const no = (reason: string): ToolCheck => ({ ok: false, cost: 0, reason });

/** HP a barricade kit puts up: full, or what a pried-off one had left. */
function kitHp(item: ItemInstance, tier: number): number {
  return typeof item.data.hp === 'number' ? item.data.hp : BARRICADE_TIERS[tier]!.hp;
}

function entityOnTile(game: Game, x: number, y: number): boolean {
  const all = [game.player, ...game.room.enemies];
  return all.some((e) => e.x + e.radius > x && e.x - e.radius < x + 1 && e.y + e.radius > y && e.y - e.radius < y + 1);
}

export const toolActions: Record<string, ToolAction> = {
  demolish: {
    check(game, x, y, params) {
      // A crowbar pries a barricade off whole; other demolition tools smash it.
      if (game.room.layout.barricadeAt(x, y)) return { ok: true, cost: 1 };
      const o = game.room.layout.obstacleAt(x, y);
      if (!o) return no('Nothing to demolish');
      if (!o.renovate?.includes('demolish')) return no(`Can't demolish ${o.name}`);
      if (params.maxHeight === 'short' && o.height === 'tall') return no(`${o.name} is too sturdy for that`);
      return { ok: true, cost: o.height === 'short' ? 1 : 2 };
    },
    apply(game, x, y, params) {
      if (game.room.layout.barricadeAt(x, y)) {
        if (params.pry) game.pryBarricade(x, y);
        else game.breakBarricade(x, y);
        return;
      }
      game.setTile(x, y, null);
      game.burst(x + 0.5, y + 0.5, 0x9a8a7a, 10);
    },
  },

  /** Plant a company flag on an open tile: claims its room (one with monsters in it starts out insecure). */
  plantFlag: {
    check(game, x, y) {
      if (game.room.ownedAt(x, y)) return no('This room is already yours');
      if (!game.room.layout.isBuildable(x, y)) return no("The flag won't stand there");
      if (entityOnTile(game, x, y)) return no('Something is in the way');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y) {
      game.plantFlag(x, y);
    },
  },

  /** Stand a For Rent sign on an open tile: lists the unit it's in (only your property draws applicants). */
  placeSign: {
    check(game, x, y) {
      if (!game.room.layout.isBuildable(x, y)) return no("It won't stand there");
      if (entityOnTile(game, x, y)) return no('Something is in the way');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y) {
      game.placeSign(x, y);
    },
  },

  /** Board up / fit a door on one of the room's door tiles; repairs or upgrades an existing one. */
  barricade: {
    check(game, x, y, params, item) {
      const L = game.room.layout;
      if (L.kindAt(x, y) !== 'door') return no('Barricades go in doorways');
      const door = L.roomAt(x, y)?.info.doors.find((d) => d.x === x && d.y === y);
      if (door && game.room.ownedAt(x, y) && isOwnedBy(game.session.state.rooms[door.toRoom], game.session.playerId)) {
        return no('Both rooms are yours: no barricade needed here');
      }
      const tier = Number(params.tier ?? 1);
      const b = L.barricadeAt(x, y);
      const hp = kitHp(item, tier);
      if (b && b.tier > tier) return no('A stronger barricade is already there');
      if (b && b.tier === tier && b.hp >= hp) return no(hp < BARRICADE_TIERS[tier]!.hp ? 'That one is in better shape' : 'Already in good shape');
      if (entityOnTile(game, x, y)) return no('Something is in the way');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params, item) {
      const tier = Number(params.tier ?? 1);
      game.setBarricade(x, y, { tier, hp: kitHp(item, tier) });
      game.burst(x + 0.5, y + 0.5, 0xc0a070, 8);
    },
  },

  /** Lay a pipe or wire segment on any tile (floor, wall or door), or repair a faulty one. */
  layUtility: {
    repeat: true,
    check(game, x, y, params) {
      const kind = params.kind as UtilityKind;
      const L = game.room.layout.roomAt(x, y);
      if (!L) return no('Nothing to run it through');
      const seg = L.state.utilities?.[`${x},${y}`]?.[kind];
      if (seg?.fault) return { ok: true, cost: 1 };
      if (seg) return no(kind === 'power' ? 'Already wired' : 'Already piped');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params) {
      game.layUtility(x, y, params.kind as UtilityKind);
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
      game.setSurface(x, y, 'floor', String(params.surface ?? 'plywood_patch'));
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
        if (L.wallSurfaceAt(x, y) === surface.id) return no('Already papered');
        return { ok: true, cost: o.height === 'short' ? 1 : 2 };
      }
      const kind = L.kindAt(x, y);
      if ((kind !== 'floor' && kind !== 'door') || o) return no('Flooring goes on open floor');
      if (L.floorSurfaceAt(x, y) === surface.id) return no('Already covered');
      return { ok: true, cost: 1 };
    },
    apply(game, x, y, params) {
      const surface = registry.surfaces.get(String(params.surface));
      game.setSurface(x, y, surface.applies, surface.id);
    },
  },
};

/**
 * Resolve the action + params for a hand item: tools and rolls always renovate; dual-use weapons
 * only in `renovating` context (nothing alive in the targeted room) and attack otherwise.
 */
export function actionFor(item: ItemInstance | null, renovating = true): { action: ToolAction; params: Record<string, unknown> } | null {
  if (!item) return null;
  const def = registry.items.get(item.defId);
  if (def.kind === 'tool' || (def.kind === 'weapon' && def.tool && renovating)) {
    const ref = def.kind === 'tool' ? def.action : def.tool!.action;
    const action = toolActions[ref.id];
    return action ? { action, params: ref.params ?? {} } : null;
  }
  if (def.kind === 'roll') return { action: toolActions.applySurface!, params: { surface: def.surface } };
  return null;
}
