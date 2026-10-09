import { tileKey } from '../core/geometry';
import type { Rng } from '../core/rng';
import { furniture as furnitureReg } from '../content/registry';
import { registerTick } from './advance';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { footprint } from './layout';
import { roomLabel } from './securing';
import type { FurniturePlacement, WorldState } from './types';

/**
 * Utilities (D19/D21/D22/D25): power and water reach fixtures through physical networks of wire and
 * pipe, laid by the player as a hidden per-tile layer (`RoomState.utilities`) that runs through floors,
 * walls and doors alike. Tiles are global, so runs cross from room to room. A network carries its kind
 * if it touches a source (a generator, a water main); there is no capacity limit (P6 Q2). A faulty
 * segment is a gap in the network.
 *
 * Fixtures only need supplying in property someone owns: rooms nobody owns run on the Backrooms' own
 * hum, and the apartment is on the landlord's supply.
 */
export type UtilityKind = 'power' | 'water';
export const UTILITY_KINDS: readonly UtilityKind[] = ['power', 'water'];

export interface Segment {
  fault?: true;
}

export type UtilityTile = Partial<Record<UtilityKind, Segment>>;

/** Chance per 15-minute tick that a healthy segment in your property fails. */
export const FAULT_CHANCE = 0.0003;

export interface UtilityNet {
  /** Every segment on the floor: tile → its room and whether it's faulty. */
  segments: Map<string, { roomId: string; fault: boolean }>;
  /** Healthy segments connected to a source. */
  served: Set<string>;
}

export type UtilityNets = Record<UtilityKind, UtilityNet>;

/** A furniture piece's footprint plus the tiles orthogonally next to it: where it meets a pipe or wire. */
export function contactTiles(f: FurniturePlacement): string[] {
  const def = furnitureReg.tryGet(f.defId);
  if (!def) return [];
  const { w, h } = footprint(def, f.rot);
  const out = new Set<string>();
  for (let y = f.y; y < f.y + h; y++) {
    for (let x = f.x; x < f.x + w; x++) {
      out.add(tileKey(x, y));
      out.add(tileKey(x + 1, y));
      out.add(tileKey(x - 1, y));
      out.add(tileKey(x, y + 1));
      out.add(tileKey(x, y - 1));
    }
  }
  return [...out];
}

/** Every network on a floor, per kind: which segments are live. */
export function utilityNets(state: WorldState, floor: number): UtilityNets {
  const nets = {} as UtilityNets;
  for (const kind of UTILITY_KINDS) nets[kind] = { segments: new Map(), served: new Set() };
  const sources: Record<UtilityKind, string[]> = { power: [], water: [] };
  for (const room of Object.values(state.rooms)) {
    if (room.floor !== floor) continue;
    for (const [k, t] of Object.entries(room.utilities ?? {})) {
      for (const kind of UTILITY_KINDS) {
        const seg = t[kind];
        if (seg) nets[kind].segments.set(k, { roomId: room.id, fault: !!seg.fault });
      }
    }
    for (const f of room.furniture) {
      const provides = furnitureReg.tryGet(f.defId)?.utility?.provides;
      if (provides) sources[provides].push(...contactTiles(f));
    }
  }
  for (const kind of UTILITY_KINDS) {
    const { segments, served } = nets[kind];
    const healthy = (k: string) => segments.has(k) && !segments.get(k)!.fault;
    const queue = sources[kind].filter((k) => healthy(k) && !served.has(k));
    for (const k of queue) served.add(k);
    while (queue.length) {
      const [x, y] = queue.shift()!.split(',').map(Number) as [number, number];
      for (const n of [tileKey(x + 1, y), tileKey(x - 1, y), tileKey(x, y + 1), tileKey(x, y - 1)]) {
        if (served.has(n) || !healthy(n)) continue;
        served.add(n);
        queue.push(n);
      }
    }
  }
  return nets;
}

/** Whether a furniture piece in `roomId` has what it needs to work (always true if it needs nothing). */
export function fixtureSupplied(state: WorldState, nets: UtilityNets, roomId: string, f: FurniturePlacement): boolean {
  const needs = furnitureReg.tryGet(f.defId)?.utility?.needs;
  if (!needs) return true;
  const room = state.rooms[roomId];
  if (!room || room.floor === APARTMENT_FLOOR || !room.ownerId) return true;
  const served = nets[needs].served;
  return contactTiles(f).some((k) => served.has(k));
}

/** Whether any of these tiles (or one next to them) is on a live network of `kind`. */
export function tilesSupplied(nets: UtilityNets, kind: UtilityKind, tiles: Iterable<string>): boolean {
  const served = nets[kind].served;
  if (!served.size) return false;
  for (const k of tiles) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (served.has(k) || served.has(tileKey(x + 1, y)) || served.has(tileKey(x - 1, y)) || served.has(tileKey(x, y + 1)) || served.has(tileKey(x, y - 1))) return true;
  }
  return false;
}

/**
 * One 15-minute tick: now and then a segment in someone's property fails. A failure that cuts
 * something off is reported to the owner by room, not by tile: the symptom (puddle, sparks) shows where.
 */
export function utilitiesTick(state: WorldState, ctx: { clock: { day: number; minute: number }; rng: Rng }): Command[] {
  const out: Command[] = [];
  const netsByFloor = new Map<number, UtilityNets>();
  for (const room of Object.values(state.rooms)) {
    if (!room.ownerId || room.floor === APARTMENT_FLOOR || !room.utilities) continue;
    for (const [k, t] of Object.entries(room.utilities)) {
      for (const kind of UTILITY_KINDS) {
        const seg = t[kind];
        if (!seg || seg.fault || !ctx.rng.chance(FAULT_CHANCE)) continue;
        const [x, y] = k.split(',').map(Number) as [number, number];
        out.push({ type: 'utilityFault', roomId: room.id, x, y, kind, fault: true });
        if (!netsByFloor.has(room.floor)) netsByFloor.set(room.floor, utilityNets(state, room.floor));
        if (!netsByFloor.get(room.floor)![kind].served.has(k)) continue;
        const info = state.floors[room.floor]?.rooms[room.id];
        out.push({
          type: 'messagePosted', playerId: room.ownerId,
          message: {
            id: `fault${ctx.clock.day}-${ctx.clock.minute}-${room.id}-${k}-${kind}`, day: ctx.clock.day, minute: ctx.clock.minute, severity: 'warn',
            from: 'Facilities',
            text: kind === 'power'
              ? `The power just cut out somewhere in ${info ? roomLabel(info) : 'your property'}. Look for sparks, then fix the wire.`
              : `Something's leaking in ${info ? roomLabel(info) : 'your property'}. Find the puddle and fix the pipe.`,
          },
        });
      }
    }
  }
  return out;
}

export function registerUtilities(): void {
  registerTick('utilities', utilitiesTick);
}
