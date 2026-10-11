import { furniture as furnitureReg, items as itemReg, roomTemplates } from '../content/registry';
import type { Rng } from '../core/rng';
import type { EnemyDef } from '../content/types';
import { registerDaily, registerTick } from './advance';
import type { Command } from './commands';
import { APARTMENT_FLOOR, spillCapacity } from './difficulty';
import { enemies as enemyReg } from '../content/registry';
import { doorKey, partnerDoor } from './doors';
import { openings } from './area';
import { RoomLayout, inward } from './layout';

import type { Barricade, DoorInfo, RoomInfo, RoomState, WorldState } from './types';

/**
 * Securing property. Rooms are claimed by planting a company flag in them once cleared. Monsters only
 * ever come from rooms that still have monsters in them: every 15-minute tick, an unbarricaded door
 * into such an *uncleared* room may let one or two through, until the room is full. Barricades stop
 * that, and wear down while there are monsters behind them. An owned room is secure when it's empty
 * and every door into an uncleared room is barricaded at the required tier.
 */

export interface BarricadeTier { hp: number; passable: boolean }

/** Tier → stats. Tier 1 (planks) blocks everyone; the doors above open for the owner. */
export const BARRICADE_TIERS: Record<number, BarricadeTier> = {
  1: { hp: 20, passable: false },
  2: { hp: 80, passable: true },
  3: { hp: 160, passable: true },
  4: { hp: 300, passable: true },
};
export const MAX_TIER = 4;
/** Chance per 15-minute tick that monsters come through each unbarricaded door into an uncleared room. */
export const SPAWN_CHANCE = 0.25;
/** Chance such an arrival is a pair rather than one. */
export const PAIR_CHANCE = 0.3;

/** HP a barricade loses per 15-minute tick with monsters behind it in a room of this difficulty. */
export function pressurePerTick(difficulty: number): number {
  return 0.0625 * (1 + difficulty);
}

/** Tier a door needs, from the difficulty of the room on its other side. */
export function requiredTier(difficulty: number): number {
  return Math.min(MAX_TIER, 1 + Math.floor(difficulty / 3));
}


/** The kit item that puts up a barricade of this tier. */
export function barricadeKit(tier: number): string | undefined {
  return itemReg.all().find((d) => d.kind === 'tool' && d.action.id === 'barricade' && Number(d.action.params?.tier) === tier)?.id;
}

export function barricadeOn(state: RoomState, door: DoorInfo): Barricade | undefined {
  return state.barricades[doorKey(door)];
}

export interface DoorStatus {
  door: DoorInfo;
  neighbor: RoomInfo;
  barricade?: Barricade;
  /** Tier this door needs (from the neighbour's difficulty). */
  required: number;
  /** The room behind has monsters in it (it's uncleared). */
  uncleared: boolean;
  /** Monsters can come through: no barricade, and the room behind is uncleared. */
  source: boolean;
  /** Good enough for security: nothing behind it, or a barricade of at least the required tier. */
  adequate: boolean;
}

/** The status of each door of a room. */
export function doorStatuses(state: WorldState, info: RoomInfo): DoorStatus[] {
  const room = state.rooms[info.id]!;
  const floor = state.floors[info.floor]!;
  // Knocked-through walls connect rooms too, one status per neighbour; they can't be barricaded (build a wall back).
  const gaps = new Map<string, DoorInfo>();
  for (const o of openings(state, info)) if (!gaps.has(o.toRoom)) gaps.set(o.toRoom, { x: o.x, y: o.y, dir: o.dir, toRoom: o.toRoom });
  return [...info.doors, ...gaps.values()].map((door) => {
    const neighbor = floor.rooms[door.toRoom]!;
    const n = state.rooms[door.toRoom];
    const barricade = barricadeOn(room, door);
    const required = requiredTier(neighbor.difficulty);
    const uncleared = !!n && n.monsters.length > 0;
    return {
      door, neighbor, barricade, required, uncleared,
      source: !barricade && uncleared,
      adequate: !uncleared || (!!barricade && barricade.tier >= required),
    };
  });
}

/** Empty, and every door into an uncleared room adequately barricaded. */
export function securedRoom(state: WorldState, roomId: string): boolean {
  const room = state.rooms[roomId];
  const info = room && state.floors[room.floor]?.rooms[roomId];
  if (!room || !info || room.monsters.length) return false;
  return doorStatuses(state, info).every((d) => d.adequate);
}

/**
 * The single "is this a safe area" predicate (sleeping, the midnight rule).
 * Home is always safe; otherwise a room must be owned and secured by its owner.
 */
export function isSecure(state: WorldState, roomId: string): boolean {
  const room = state.rooms[roomId];
  if (!room?.ownerId) return false;
  if (state.floors[room.floor]?.rooms[roomId]?.tags.includes('home')) return true;
  return securedRoom(state, roomId);
}

/** Doors still keeping a room from being secure: count and highest tier needed. */
export function securityNeeds(state: WorldState, info: RoomInfo): { doors: number; tier: number } {
  const missing = doorStatuses(state, info).filter((d) => !d.adequate);
  return { doors: missing.length, tier: Math.max(0, ...missing.map((d) => d.required)) };
}

/** "Security Office (Level 1)" */
export function roomLabel(info: RoomInfo): string {
  if (info.floor === APARTMENT_FLOOR) return 'your apartment';
  if (info.tags.includes('lobby')) return `the Level ${info.floor} lobby`;
  const t = roomTemplates.get(info.templateId);
  const name = t.id.split('_').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  return `the ${name} (Level ${info.floor})`;
}

/** How much is in a room: the difficulty of every monster in it. */
const loadOf = (room: RoomState) => room.monsters.reduce((s, m) => s + (enemyReg.tryGet(m.defId)?.difficulty ?? 0), 0);
const rid = (rng: Rng, prefix: string) => `${prefix}${Math.floor(rng.next() * 2 ** 31).toString(36)}${Math.floor(rng.next() * 2 ** 31).toString(36)}`;

/**
 * One 15-minute tick: barricades with monsters behind them wear down (and break), and monsters come
 * through unbarricaded doors from uncleared rooms into every room you've visited: more of whatever
 * lives behind that door, until the room holds as much as that neighbour spills (`spillCapacity`).
 * Only rooms you own getting invaded are reported (urgently); unowned rooms refill silently.
 */
export function securingTick(
  state: WorldState,
  ctx: { clock: { day: number; minute: number }; rng: Rng; quiet?: ReadonlySet<string> },
): Command[] {
  const out: Command[] = [];
  const { rng } = ctx;
  const quiet = ctx.quiet ?? new Set<string>();
  // A barricade belongs to the doorway (both door tiles): wear it once per tick, from whichever side has monsters.
  const doorwaysDone = new Set<string>();
  for (const floor of Object.values(state.floors)) {
    if (floor.index === APARTMENT_FLOOR) continue;
    for (const info of Object.values(floor.rooms)) {
      const room = state.rooms[info.id];
      if (!room?.visited || quiet.has(info.id)) continue;
      const wasClear = room.monsters.length === 0;
      let load = loadOf(room);
      const damaged: Record<string, number> = {};
      const arrive = ({ door, neighbor }: DoorStatus) => {
        // Monsters like the ones behind the door come through (the room behind keeps its own).
        const pool = (state.rooms[neighbor.id]?.monsters ?? [])
          .map((m) => enemyReg.tryGet(m.defId))
          .filter((d): d is EnemyDef => !!d && !d.boss && !d.npc);
        const capacity = spillCapacity(neighbor.difficulty);
        let n = 0;
        for (let i = rng.chance(PAIR_CHANCE) ? 2 : 1; i > 0 && pool.length && load < capacity; i--) {
          const def = rng.pick(pool);
          out.push({ type: 'monsterAdded', roomId: info.id, record: { id: rid(rng, 'm'), defId: def.id, door: doorKey(door) } });
          // They don't come in tidily.
          const [ix, iy] = inward(door.dir);
          const mx = door.x + ix * (1 + rng.int(0, 1)), my = door.y + iy * (1 + rng.int(0, 1)) + (ix ? rng.int(-1, 1) : 0);
          if (new RoomLayout(info, room).isOpenFloor(mx, my)) out.push({ type: 'messAdded', roomId: info.id, x: mx, y: my });
          load += def.difficulty;
          n++;
        }
        return n > 0;
      };
      let breached = false;
      let arrived = false;
      for (const d of doorStatuses(state, info)) {
        if (!d.uncleared || quiet.has(d.door.toRoom)) continue;
        if (d.barricade) {
          const self = `${info.id}|${doorKey(d.door)}`;
          if (doorwaysDone.has(self)) continue;
          doorwaysDone.add(self);
          const p = partnerDoor(state, info.id, doorKey(d.door));
          if (p) doorwaysDone.add(`${p.roomId}|${p.key}`);
          const hp = Math.round((d.barricade.hp - pressurePerTick(d.neighbor.difficulty)) * 1000) / 1000;
          if (hp > 0) {
            damaged[doorKey(d.door)] = hp;
            continue;
          }
          out.push({ type: 'barricadeSet', roomId: info.id, door: doorKey(d.door), barricade: null });
          breached = true;
          if (arrive(d)) arrived = true;
        } else if (rng.chance(SPAWN_CHANCE) && arrive(d)) {
          arrived = true;
        }
      }
      if (Object.keys(damaged).length) out.push({ type: 'barricadesDamaged', roomId: info.id, hp: damaged });
      if (!arrived && !breached) continue;
      // Only your own rooms getting invaded is news; monsters drifting back into unowned rooms isn't.
      if (!room.ownerId) continue;
      if (room.insecureSince === undefined) out.push({ type: 'roomInsecure', roomId: info.id, since: ctx.clock.day });
      if (breached || wasClear) {
        out.push({
          type: 'messagePosted', playerId: room.ownerId,
          message: {
            id: rid(rng, 'msg'), day: ctx.clock.day, minute: ctx.clock.minute, severity: 'urgent',
            text: breached
              ? `Breach! Something broke through the barricade into ${roomLabel(info)}. Clear it and re-barricade by the end of tomorrow, or lose the room.`
              : `Monsters got into ${roomLabel(info)} through an unbarricaded door. Secure it by the end of tomorrow, or lose the room.`,
          },
        });
      }
    }
  }
  return out;
}

/**
 * The day ends: owned rooms that are secure clear their deadline; insecure ones start one, and those
 * insecure since an earlier day are lost.
 */
export function securingDay(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  const out: Command[] = [];
  const atRisk = new Map<string, string[]>();
  for (const floor of Object.values(state.floors)) {
    if (floor.index === APARTMENT_FLOOR) continue;
    for (const info of Object.values(floor.rooms)) {
      const room = state.rooms[info.id];
      if (!room?.ownerId) continue;
      const secure = isSecure(state, info.id);
      if (secure) {
        if (room.insecureSince !== undefined) out.push({ type: 'roomInsecure', roomId: info.id, since: null });
      } else if (room.insecureSince === undefined || room.insecureSince === ctx.day) {
        if (room.insecureSince === undefined) out.push({ type: 'roomInsecure', roomId: info.id, since: ctx.day });
        atRisk.set(room.ownerId, [...(atRisk.get(room.ownerId) ?? []), roomLabel(info)]);
      } else if (room.insecureSince < ctx.day) {
        out.push({ type: 'roomInsecure', roomId: info.id, since: null });
        out.push({ type: 'roomOwnerCleared', roomId: info.id });
        for (const f of room.furniture) if (furnitureReg.tryGet(f.defId)?.claimsRoom) out.push({ type: 'furnitureRemoved', roomId: info.id, uid: f.uid });
        out.push({
          type: 'messagePosted', playerId: room.ownerId,
          message: { id: rid(ctx.rng, 'msg'), day: ctx.day, minute: 24 * 60, severity: 'urgent', text: `You lost ${roomLabel(info)}: it wasn't secured in time.` },
        });
      }
    }
  }
  for (const [playerId, rooms] of atRisk) {
    out.push({
      type: 'messagePosted', playerId,
      message: {
        id: rid(ctx.rng, 'msg'), day: ctx.day, minute: 24 * 60, severity: 'warn',
        text: `Not secure: ${rooms.join(', ')}. Clear it out and barricade every door to a room with monsters by the end of tomorrow, or lose ${rooms.length > 1 ? 'them' : 'it'}.`,
      },
    });
  }
  return out;
}

export function registerSecuring(): void {
  registerTick('securing', securingTick);
  registerDaily('securing', securingDay);
}
