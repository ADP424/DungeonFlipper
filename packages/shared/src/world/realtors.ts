import { cellCenter } from '../core/constants';
import type { Rng } from '../core/rng';
import { furniture as furnitureReg } from '../content/registry';
import { registerDaily, registerTick } from './advance';
import { absoluteMinute } from './clock';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { RoomLayout } from './layout';
import { REP } from './reputation';
import { BARRICADE_TIERS, doorStatuses, roomLabel } from './securing';
import { getTenants, tenantUnit } from './tenants';
import type { FurniturePlacement, WorldState } from './types';
import type { UnitStats } from './units';

/**
 * Rival realtors (P8, D27/D36). They open an office in a cleared room nobody owns, then claim more of
 * those as they turn up (racing you for them). Each has a hidden relation with you that sets their
 * temperament:
 *   amiable     – just competes for space
 *   competitive – undercuts your listings and lures your unhappy tenants
 *   hostile     – also sends thugs to rob your rooms
 * Selling them rooms and making amends warm them up; robbing or attacking them, or squeezing them out
 * (desperation), sours them. Their rooms are ordinary rooms with their id as owner (D42: actor-agnostic).
 */
export type Stance = 'amiable' | 'competitive' | 'hostile';

export interface Raid {
  roomId: string;
  /** Absolute minute (see `absoluteMinute`) when the thugs make off with what they've got. */
  until: number;
  /** Thugs still in the room. */
  thugs: number;
}

export interface Realtor {
  id: string;
  name: string;
  floor: number;
  officeRoomId: string;
  /** −100 … 100. */
  relation: number;
  cash: number;
  since: number;
  raid?: Raid;
}

export const REALTORS_KEY = 'realtors';
export const REALTOR_FLAG = 'realtor_flag';
/** First day a realtor may turn up, and when a floor's second may. */
export const REALTOR_FIRST_DAY = 3;
export const REALTOR_SECOND_DAY = 10;
export const REALTOR_ARRIVAL_CHANCE = 0.4;
export const REALTOR_EXPAND_CHANCE = 0.35;
/** Chance per 15-minute tick that a hostile realtor without a raid going starts one (~1 a day). */
export const RAID_CHANCE = 0.012;
export const RAID_MINUTES = 120;
export const RAID_STEALS = 3;
/** Unhappy tenants a competitive realtor may lure: below this mood, with this chance a day. */
export const POACH_MOOD = 40;
export const POACH_CHANCE = 0.25;

export const RELATION = {
  soldRoom: 20,
  amends: 25,
  boughtRoom: -5,
  desperation: -4,
  robbed: -50,
  /** Attacking them sets the relation to at most this. */
  attacked: -60,
} as const;
export const AMENDS_COST: Record<Stance, number> = { amiable: 0, competitive: 15, hostile: 30 };

/** Reputation for violence and theft against realtors. */
export const REP_REALTOR = { assault: -5, killed: -60, theft: -8 } as const;
export { REP };

export function getRealtors(state: WorldState): Record<string, Realtor> {
  return (state.globals[REALTORS_KEY] as Record<string, Realtor> | undefined) ?? {};
}

export function stanceOf(r: Realtor): Stance {
  return r.relation <= -40 ? 'hostile' : r.relation < 0 ? 'competitive' : 'amiable';
}

export const STANCE_NAME: Record<Stance, string> = { amiable: 'Amiable', competitive: 'Competitive', hostile: 'Hostile' };

/** The realtor owning a room, if one does. */
export function realtorOf(state: WorldState, roomId: string): Realtor | undefined {
  const owner = state.rooms[roomId]?.ownerId;
  return owner ? getRealtors(state)[owner] : undefined;
}

export function realtorRooms(state: WorldState, id: string): string[] {
  return Object.values(state.rooms).filter((r) => r.ownerId === id).map((r) => r.id);
}

/** Guards at the office: wealthier realtors (more rooms) have more. */
export function guardsFor(rooms: number): number {
  return rooms >= 7 ? 2 : rooms >= 4 ? 1 : 0;
}

/** What a room is worth: its size, its furniture and its barricades. */
export function roomValue(state: WorldState, roomId: string): number {
  const st = state.rooms[roomId];
  const info = st && state.floors[st.floor]?.rooms[roomId];
  if (!st || !info) return 0;
  const furniture = st.furniture.reduce((n, f) => n + (furnitureReg.tryGet(f.defId)?.value ?? 1), 0);
  return 30 * info.cells.length + 6 * furniture + 10 * Object.keys(st.barricades).length;
}

const SELL_MUL: Record<Stance, number> = { amiable: 1, competitive: 0.85, hostile: 0.6 };
/** What they'll pay you for a room. */
export const sellPrice = (state: WorldState, r: Realtor, roomId: string): number => Math.round(roomValue(state, roomId) * SELL_MUL[stanceOf(r)]);
/** What they want for one of theirs. */
export const buyPrice = (state: WorldState, roomId: string): number => Math.round(roomValue(state, roomId) * 1.4);

/** A room nobody owns that someone has cleared: up for grabs. */
export function freeClearedRoom(state: WorldState, roomId: string): boolean {
  const st = state.rooms[roomId];
  const info = st && state.floors[st.floor]?.rooms[roomId];
  return !!st && !!info && st.floor !== APARTMENT_FLOOR && !st.ownerId && st.visited && !st.monsters.length && !info.tags.includes('lobby');
}

/**
 * Hand a room to a new owner: the old claim marker comes down, the new one goes up (a company flag
 * for a player, a realtor's flag for a realtor), and the doors to rooms with monsters get barricaded
 * if a realtor takes it (they keep their property secure).
 */
export function transferRoom(state: WorldState, roomId: string, ownerId: string): Command[] {
  const st = state.rooms[roomId]!;
  const info = state.floors[st.floor]!.rooms[roomId]!;
  const out: Command[] = [];
  const scratch = structuredClone(st);
  for (const f of st.furniture) {
    if (!furnitureReg.tryGet(f.defId)?.claimsRoom) continue;
    out.push({ type: 'furnitureRemoved', roomId, uid: f.uid });
    scratch.furniture = scratch.furniture.filter((x) => x.uid !== f.uid);
  }
  out.push({ type: 'roomOwned', roomId, ownerId });
  const isRealtor = !!getRealtors(state)[ownerId];
  const flag = isRealtor ? REALTOR_FLAG : 'company_flag';
  const c = info.cells[0]!;
  const spot = new RoomLayout(info, scratch).findFurnitureSpot(furnitureReg.get(flag), cellCenter(c).x, cellCenter(c).y);
  if (spot) out.push({ type: 'furniturePlaced', roomId, placement: { uid: `${roomId}-flag-${ownerId.slice(0, 8)}`, defId: flag, x: spot.x, y: spot.y, rot: 0 } });
  if (isRealtor) out.push(...secureRoom(state, roomId));
  return out;
}

/** A realtor's upkeep: every door to a room with monsters barricaded at full strength. */
function secureRoom(state: WorldState, roomId: string): Command[] {
  const st = state.rooms[roomId]!;
  const info = state.floors[st.floor]!.rooms[roomId]!;
  const out: Command[] = [];
  for (const d of doorStatuses(state, info)) {
    if (!d.uncleared || !info.doors.includes(d.door)) continue;
    const hp = BARRICADE_TIERS[d.required]!.hp;
    if (d.barricade && d.barricade.tier >= d.required && d.barricade.hp >= hp) continue;
    out.push({ type: 'barricadeSet', roomId, door: `${d.door.x},${d.door.y}`, barricade: { tier: Math.max(d.required, d.barricade?.tier ?? 0), hp } });
  }
  return out;
}

/**
 * Competition for applicants (P8 Q4): an applicant for your listing may go to a competitive or
 * hostile realtor on the floor instead. Nicer units (utilities, lamps, seats, plants) keep more of them.
 */
export function undercutBy(state: WorldState, floor: number, s: UnitStats, rng: Rng): Realtor | null {
  const rivals = Object.values(getRealtors(state)).filter((r) => r.floor === floor && stanceOf(r) !== 'amiable');
  if (!rivals.length) return null;
  const nice = Math.min(3, (s.tags.light ?? 0) + (s.tags.seat ?? 0) + (s.tags.plant ?? 0));
  const chance = Math.max(0, 0.35 - 0.1 * (Number(s.power) + Number(s.water)) - 0.05 * nice);
  return rng.chance(chance) ? rng.pick(rivals) : null;
}

const FIRST = ['Brenda', 'Chad', 'Lorraine', 'Gary', 'Tiffany', 'Duane', 'Sheila', 'Rex', 'Marjorie', 'Kyle'];
const LAST = ['Coyle', 'Vantablack', 'Pemberton', 'Sloane', 'McMurtry', 'Dunleavy', 'Hargrove', 'Kask'];
const rid = (rng: Rng, prefix: string) => `${prefix}${Math.floor(rng.next() * 2 ** 31).toString(36)}${Math.floor(rng.next() * 2 ** 31).toString(36)}`;

/**
 * The day ends: realtors turn up on floors where you've started building, open an office in a free
 * cleared room, and spread into more of them. They keep their property barricaded, earn rent, and
 * sour if you're squeezing them out; competitive and hostile ones lure your unhappy tenants away.
 */
export function realtorsDay(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  const out: Command[] = [];
  const { day, rng } = ctx;
  const owner = state.ownerId;
  const minute = 24 * 60;
  const note = (text: string, severity: 'info' | 'warn' = 'info', from?: string): Command => ({
    type: 'messagePosted', playerId: owner, message: { id: rid(rng, 'msg'), day, minute, severity, text, ...(from ? { from } : {}) },
  });
  const realtors = Object.values(getRealtors(state));
  const claimed = new Set<string>();

  // Arrivals.
  if (day >= REALTOR_FIRST_DAY) {
    for (const floor of Object.values(state.floors)) {
      if (floor.index === APARTMENT_FLOOR) continue;
      const mine = Object.values(state.rooms).some((r) => r.floor === floor.index && r.ownerId === owner);
      const here = realtors.filter((r) => r.floor === floor.index).length;
      if (!mine || here >= (day >= REALTOR_SECOND_DAY ? 2 : 1) || !rng.chance(REALTOR_ARRIVAL_CHANCE)) continue;
      const free = Object.keys(floor.rooms).filter((id) => freeClearedRoom(state, id));
      if (!free.length) continue;
      const office = rng.pick(free);
      claimed.add(office);
      const r: Realtor = {
        id: rid(rng, 'realtor'), name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, floor: floor.index, officeRoomId: office,
        relation: rng.int(-25, 30), cash: 200, since: day,
      };
      out.push({ type: 'realtorSet', realtor: r });
      // Commands are applied in order, so the realtor exists by the time the room is handed over.
      out.push(...transferRoom({ ...state, globals: { ...state.globals, [REALTORS_KEY]: { ...getRealtors(state), [r.id]: r } } }, office, r.id));
      out.push(note(`A realtor, ${r.name}, has opened an office in ${roomLabel(floor.rooms[office]!)}. They seem ${STANCE_NAME[stanceOf(r)].toLowerCase()}.`, 'warn', 'Listings'));
    }
  }

  for (const r of realtors) {
    const floor = state.floors[r.floor];
    if (!floor) continue;
    const rooms = realtorRooms(state, r.id);
    let relation = r.relation;
    let cash = r.cash + 10 * rooms.length;
    // Expansion: a free cleared room, preferably next to theirs.
    if (rng.chance(REALTOR_EXPAND_CHANCE)) {
      const free = Object.keys(floor.rooms).filter((id) => freeClearedRoom(state, id) && !claimed.has(id));
      const near = free.filter((id) => floor.rooms[id]!.doors.some((d) => rooms.includes(d.toRoom)));
      const pick = near.length ? rng.pick(near) : free.length ? rng.pick(free) : null;
      if (pick) {
        claimed.add(pick);
        out.push(...transferRoom(state, pick, r.id));
        out.push(note(`${r.name} claimed ${roomLabel(floor.rooms[pick]!)}.`));
      }
    }
    // Upkeep: their doors to monsters stay barricaded.
    for (const id of rooms) out.push(...secureRoom(state, id));
    // Desperation: squeezed out by you, they turn on you.
    const yours = Object.values(state.rooms).filter((x) => x.floor === r.floor && x.ownerId === owner).length;
    if (yours >= 3 * Math.max(1, rooms.length)) relation += RELATION.desperation;
    // Competitive and hostile realtors lure away your unhappy tenants on their floor.
    if (stanceOf(r) !== 'amiable') {
      for (const t of Object.values(getTenants(state))) {
        if (t.status !== 'living' || t.floor !== r.floor || t.mood >= POACH_MOOD || !rng.chance(POACH_CHANCE)) continue;
        const u = tenantUnit(state, t);
        out.push({ type: 'tenantRemoved', id: t.id });
        out.push(note(`${t.name} moved out of ${u ? roomLabel(floor.rooms[u.rooms[0]!]!) : 'their place'}: ${r.name} talked them into one of theirs.`, 'warn'));
      }
    }
    relation = Math.max(-100, Math.min(100, relation));
    if (relation !== r.relation || cash !== r.cash) out.push({ type: 'realtorSet', realtor: { ...r, relation, cash } });
  }
  return out;
}

/**
 * Every 15-minute tick: hostile realtors send thugs to rob one of your rooms (you have two hours to get
 * there and fight them off); a raid nobody stops ends with up to three pieces of furniture carried off
 * to the realtor's office.
 */
export function realtorsTick(state: WorldState, ctx: { clock: { day: number; minute: number }; rng: Rng }): Command[] {
  const out: Command[] = [];
  const { rng, clock } = ctx;
  const now = absoluteMinute(clock);
  const owner = state.ownerId;
  for (const r of Object.values(getRealtors(state))) {
    const floor = state.floors[r.floor];
    if (!floor) continue;
    if (r.raid) {
      if (now < r.raid.until) continue;
      const room = state.rooms[r.raid.roomId];
      const info = floor.rooms[r.raid.roomId];
      const office = state.rooms[r.officeRoomId];
      const officeInfo = floor.rooms[r.officeRoomId];
      if (room && info && room.ownerId === owner && office && officeInfo) {
        const scratch = structuredClone(office);
        for (const f of rng.shuffle(stealable(room.furniture)).slice(0, RAID_STEALS)) {
          const def = furnitureReg.get(f.defId);
          const c = officeInfo.cells[0]!;
          const spot = new RoomLayout(officeInfo, scratch).findFurnitureSpot(def, cellCenter(c).x, cellCenter(c).y, f.rot);
          out.push({ type: 'furnitureRemoved', roomId: room.id, uid: f.uid });
          if (spot) {
            const placed = { ...f, x: spot.x, y: spot.y };
            scratch.furniture.push(placed);
            out.push({ type: 'furniturePlaced', roomId: office.id, placement: placed });
          }
        }
      }
      out.push({ type: 'realtorSet', realtor: { ...r, raid: undefined } });
      continue;
    }
    if (stanceOf(r) !== 'hostile' || !rng.chance(RAID_CHANCE)) continue;
    const targets = Object.values(state.rooms).filter((x) => {
      const info = floor.rooms[x.id];
      return x.floor === r.floor && x.ownerId === owner && info && !info.tags.includes('lobby') && stealable(x.furniture).length > 0;
    });
    if (!targets.length) continue;
    const target = rng.pick(targets);
    const thugs = 2 + Math.floor(realtorRooms(state, r.id).length / 3);
    out.push({ type: 'realtorSet', realtor: { ...r, raid: { roomId: target.id, until: now + RAID_MINUTES, thugs } } });
  }
  return out;
}

/** Furniture thugs (or you) can carry off: anything movable except claim markers and signs. */
export function stealable(furniture: FurniturePlacement[]): FurniturePlacement[] {
  return furniture.filter((f) => {
    const def = furnitureReg.tryGet(f.defId);
    return def && !def.fixed && !def.claimsRoom && f.defId !== 'for_rent_sign';
  });
}

export function registerRealtors(): void {
  registerDaily('realtors', realtorsDay);
  registerTick('realtors', realtorsTick);
}
