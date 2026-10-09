import type { Rng } from '../core/rng';
import { registerDaily, registerTick } from './advance';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { roomLabel } from './securing';
import { findSign, signs, unitAt, unitStats, type Unit, type UnitStats } from './units';
import type { WorldState } from './types';
import { openings } from './area';

/**
 * Tenants. A listed unit (a For Rent sign in it) draws applicants from the floor's lobby; you haggle
 * a rent, they move in, and rent arrives every day. Tenants have preferences (only some known to you)
 * that set what the unit is worth to them, capped by their tier. They mind danger: insecure units,
 * a cut-off route to the lobby, monsters next door. Records live in `globals.tenants` (world-level,
 * since tenants move between units and rooms).
 */

export type PrefKind = 'tag' | 'floor' | 'space' | 'bright' | 'quiet' | 'utility';
export interface Pref { kind: PrefKind; key?: string; like: boolean }

export interface Tenant {
  id: string;
  name: string;
  tier: number;
  prefs: Pref[];
  /** How many of `prefs` (from the front) you know. */
  known: number;
  /** The For Rent sign of their unit. */
  signUid: string;
  floor: number;
  status: 'applicant' | 'living';
  rent: number;
  /** 0–100: below 0 they leave. */
  mood: number;
  /** Rejected offers while haggling (3 and they walk). */
  strikes: number;
  /** Day they arrived (applicants give up after 2 days). */
  since: number;
  lastTalk?: number;
  /** Day monsters trapped them in their unit (they die at that day's end unless rescued). */
  trapped?: number;
  /** Fled to a safe room next door while monsters are in their unit. */
  displaced?: boolean;
}

export const TENANTS_KEY = 'tenants';
export const LANDLORD_KEY = 'landlord';

/** Tier → [base rent, ceiling] per day. Higher tiers come with reputation (later). */
export const TIER_RENT: Record<number, [number, number]> = { 1: [5, 8], 2: [10, 18], 3: [20, 40] };
/** Rent offers the haggling slider spans. */
export const MAX_OFFER = 20;

export function getTenants(state: WorldState): Record<string, Tenant> {
  return (state.globals[TENANTS_KEY] as Record<string, Tenant> | undefined) ?? {};
}

const FIRST = ['Dana', 'Morgan', 'Sam', 'Alex', 'Robin', 'Jesse', 'Casey', 'Riley', 'Quinn', 'Avery', 'Jordan', 'Toni', 'Mel', 'Kit', 'Lou', 'Pat'];
const LAST = ['Novak', 'Okafor', 'Lindqvist', 'Reyes', 'Hart', 'Kowalski', 'Bell', 'Mbeki', 'Sato', 'Varga', 'Price', 'Doyle', 'Ferreira', 'Holt'];
const TAG_PREFS = ['plant', 'light', 'seat', 'table', 'storage', 'music'];

/** A new tier-1 applicant with 3–4 preferences, the first 1–2 of which you're told up front (D32). */
export function makeApplicant(rng: Rng, id: string, signUid: string, floor: number, day: number): Tenant {
  const prefs: Pref[] = [];
  const pool: Pref[] = rng.shuffle([
    ...TAG_PREFS.map((key) => ({ kind: 'tag' as const, key, like: rng.chance(0.75) })),
    { kind: 'floor', key: 'carpet', like: rng.chance(0.6) },
    { kind: 'floor', key: 'wood', like: rng.chance(0.6) },
    { kind: 'space', like: rng.chance(0.5) },
    { kind: 'bright', like: rng.chance(0.7) },
  ]);
  const n = rng.int(3, 4);
  for (const p of pool) {
    if (prefs.length >= n - 1) break;
    if (prefs.some((q) => q.kind === p.kind && q.key === p.key)) continue;
    prefs.push(p);
  }
  // Everyone wants to be left alone by monsters; it's usually not what they lead with.
  prefs.splice(rng.int(1, prefs.length), 0, { kind: 'quiet', like: true });
  // Some won't live without power or running water (P6).
  if (rng.chance(UTILITY_NEED_CHANCE)) prefs.splice(rng.int(0, prefs.length), 0, { kind: 'utility', key: rng.chance(0.5) ? 'power' : 'water', like: true });
  return {
    id, name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, tier: 1, prefs, known: rng.int(1, 2),
    signUid, floor, status: 'applicant', rent: 0, mood: 60, strikes: 0, since: day,
  };
}

/** How well a unit meets one preference, −1 … 1. */
export function prefScore(p: Pref, s: UnitStats): number {
  const sign = p.like ? 1 : -1;
  switch (p.kind) {
    case 'tag': return sign * Math.min(1, (s.tags[p.key!] ?? 0) / 2);
    case 'floor': return sign * (2 * (s.floors[p.key!] ?? 0) - 1) * 0.6;
    case 'space': return sign * Math.max(-1, Math.min(1, (s.area - 60) / 60));
    case 'bright': return sign * Math.max(-1, Math.min(1, ((s.tags.light ?? 0) / Math.max(1, s.area / 40)) - 0.5));
    case 'quiet': return s.quiet ? 0.4 : -1;
    case 'utility': return s[p.key as 'power' | 'water'] ? 0.5 : -1;
  }
}

/** Share of applicants who need power or running water. */
export const UTILITY_NEED_CHANCE = 0.4;

/** A utility this tenant needs that the unit doesn't have (they'll pay nothing for it). */
export function missingNeed(t: Tenant, s: UnitStats): 'power' | 'water' | null {
  const p = t.prefs.find((q) => q.kind === 'utility' && !s[q.key as 'power' | 'water']);
  return p ? (p.key as 'power' | 'water') : null;
}

/** Daily rent the unit is worth to this tenant: their tier's base, scaled by their preferences, capped by the tier. 0 without a bed. */
export function valuation(t: Tenant, s: UnitStats): number {
  if (s.beds < 1 || missingNeed(t, s)) return 0;
  const [base, cap] = TIER_RENT[t.tier] ?? TIER_RENT[1]!;
  const score = t.prefs.reduce((sum, p) => sum + prefScore(p, s), 0);
  // Everyone pays more for power and running water.
  const utilities = (s.power ? 0.15 : 0) + (s.water ? 0.15 : 0);
  return Math.max(1, Math.min(cap, Math.round(base * (1 + 0.3 * score + utilities))));
}

/** How a tenant takes a rent offer (D18). */
export function haggle(value: number, offer: number): { result: 'accept' | 'counter' | 'refuse'; counter?: number; mood: number } {
  if (offer <= value) return { result: 'accept', mood: Math.round(50 + 40 * (1 - offer / Math.max(1, value))) };
  if (offer <= value * 1.25) return { result: 'counter', counter: value, mood: 0 };
  return { result: 'refuse', mood: 0 };
}

/** Chance a listed unit draws an applicant today: 50% with nothing unsecured around it, less per unsecured neighbour, more so if it has monsters. */
export function applicantChance(s: UnitStats): number {
  return Math.max(0.05, 0.5 - 0.08 * (s.borderUnsecured - s.borderUncleared) - 0.18 * s.borderUncleared);
}

/** A tenant's unit right now (from their sign). */
export function tenantUnit(state: WorldState, t: Tenant): Unit | null {
  const sign = findSign(state, t.signUid);
  return sign ? unitAt(state, sign.floor, sign.f.x, sign.f.y) : null;
}

const rid = (rng: Rng, prefix: string) => `${prefix}${Math.floor(rng.next() * 2 ** 31).toString(36)}${Math.floor(rng.next() * 2 ** 31).toString(36)}`;
const msg = (rng: Rng, playerId: string, day: number, minute: number, severity: 'info' | 'warn' | 'urgent', text: string, from?: string): Command => ({
  type: 'messagePosted', playerId, message: { id: rid(rng, 'msg'), day, minute, severity, text, ...(from ? { from } : {}) },
});

/**
 * The day ends: tenants pay rent and their mood drifts with how safe and suitable the place is; some
 * leave. Trapped tenants whose unit still has monsters die. Listings draw new applicants; applicants
 * who waited two days give up.
 */
export function tenantsDay(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  const out: Command[] = [];
  const { day, rng } = ctx;
  const owner = state.ownerId;
  const minute = 24 * 60;
  let income = 0;
  let payers = 0;
  const taken = new Set<string>();
  for (const t of Object.values(getTenants(state))) {
    const unit = tenantUnit(state, t);
    const where = unit ? roomLabel(state.floors[unit.floor]!.rooms[unit.rooms[0]!]!) : 'their old place';
    if (t.status === 'applicant') {
      if (!unit || day - t.since >= 2) {
        out.push({ type: 'tenantRemoved', id: t.id });
        out.push(msg(rng, owner, day, minute, 'info', `${t.name} lost interest in ${where}.`));
      } else taken.add(t.signUid);
      continue;
    }
    taken.add(t.signUid);
    if (t.trapped !== undefined && unit?.rooms.some((id) => state.rooms[id]?.monsters.length)) {
      out.push({ type: 'tenantRemoved', id: t.id });
      out.push(msg(rng, owner, day, minute, 'urgent', `${t.name} didn't make it. Monsters were still in ${where} at the end of the day.`));
      continue;
    }
    const s = unit ? unitStats(state, unit) : null;
    if (!unit || !s || s.beds < 1) {
      out.push({ type: 'tenantRemoved', id: t.id });
      out.push(msg(rng, owner, day, minute, 'warn', `${t.name} moved out: their unit is gone.`));
      continue;
    }
    const value = valuation(t, s);
    let mood = t.mood + 4;
    if (!s.secure) mood -= 20;
    if (!s.connected) mood -= 15;
    if (!s.quiet) mood -= 5;
    if (t.rent > value) mood -= 8 * (t.rent - value);
    if (t.displaced) mood -= 10;
    if (missingNeed(t, s)) mood -= 10;
    mood = Math.max(-10, Math.min(100, Math.round(mood)));
    if (mood < 0) {
      out.push({ type: 'tenantRemoved', id: t.id });
      out.push(msg(rng, owner, day, minute, 'warn', `${t.name} moved out of ${where}. They weren't happy there.`));
      continue;
    }
    income += t.rent;
    payers++;
    out.push({ type: 'tenantSet', tenant: { ...t, mood, trapped: undefined } });
  }
  if (income > 0) {
    const cash = state.players[owner]?.cash ?? 0;
    out.push({ type: 'playerUpdated', playerId: owner, patch: { cash: cash + income } });
    out.push(msg(rng, owner, day, minute, 'info', `Rent: +$${income} from ${payers} tenant${payers === 1 ? '' : 's'}.`));
  }
  // New applicants for open listings without anyone in them.
  for (const floor of Object.values(state.floors)) {
    if (floor.index === APARTMENT_FLOOR) continue;
    for (const sign of signs(state, floor.index)) {
      if (!sign.open || taken.has(sign.f.uid)) continue;
      const unit = unitAt(state, floor.index, sign.f.x, sign.f.y);
      if (!unit) continue;
      const s = unitStats(state, unit);
      if (s.beds < 1 || !s.connected || !rng.chance(applicantChance(s))) continue;
      const a = makeApplicant(rng, rid(rng, 't'), sign.f.uid, floor.index, day + 1);
      out.push({ type: 'tenantSet', tenant: a });
      out.push(msg(rng, owner, day, minute, 'info', `${a.name} is coming up from the lobby to look at ${roomLabel(floor.rooms[unit.rooms[0]!]!)}.`, 'Listings'));
    }
  }
  out.push(...landlordDay(state, ctx));
  return out;
}

/**
 * Every 15-minute tick: tenants whose unit has monsters in it flee to a safe room next door if there
 * is one; otherwise they're trapped (and die at the day's end unless you clear it). They go back
 * home once it's clear.
 */
export function tenantsTick(state: WorldState, ctx: { clock: { day: number; minute: number }; rng: Rng }): Command[] {
  const out: Command[] = [];
  const { rng, clock } = ctx;
  for (const t of Object.values(getTenants(state))) {
    if (t.status !== 'living') continue;
    const unit = tenantUnit(state, t);
    if (!unit) continue;
    const invaded = unit.rooms.some((id) => state.rooms[id]?.monsters.length);
    const where = roomLabel(state.floors[unit.floor]!.rooms[unit.rooms[0]!]!);
    if (!invaded) {
      if (t.displaced || t.trapped !== undefined) {
        out.push({ type: 'tenantSet', tenant: { ...t, displaced: false, trapped: undefined } });
        out.push(msg(rng, state.ownerId, clock.day, clock.minute, 'info', `${t.name} is back home in ${where}.`));
      }
      continue;
    }
    if (t.displaced || t.trapped !== undefined) continue;
    const floor = state.floors[unit.floor]!;
    const shelter = unit.rooms.some((id) => {
      const info = floor.rooms[id]!;
      return [...info.doors.map((d) => d.toRoom), ...openings(state, info).map((o) => o.toRoom)]
        // Somewhere of yours next door with nobody in it (its doorway into the unit is the breach, so it needn't be secure).
        .some((n) => !unit.rooms.includes(n) && state.rooms[n]?.ownerId === unit.ownerId && !state.rooms[n]!.monsters.length);
    });
    if (shelter) {
      out.push({ type: 'tenantSet', tenant: { ...t, displaced: true } });
      out.push(msg(rng, state.ownerId, clock.day, clock.minute, 'warn', `Monsters got into ${where}. ${t.name} fled next door.`));
    } else {
      out.push({ type: 'tenantSet', tenant: { ...t, trapped: clock.day } });
      out.push(msg(rng, state.ownerId, clock.day, clock.minute, 'urgent', `${t.name} is trapped in ${where} with monsters! Clear it before the day ends.`));
    }
  }
  return out;
}

/** Your own landlord (D8): weekly rent, rising slowly; unpaid rent becomes debt, notices, then a repo. */
export interface Landlord { rent: number; debt: number; notices: number }
export const LANDLORD_START: Landlord = { rent: 25, debt: 0, notices: 0 };
const LANDLORD_TEXT = [
  'Rent day. Took it from your account. You\'re welcome.',
  'Rent day. You\'re short. I\'m adding it to what you owe. Don\'t make me come down there.',
  'You owe me. Second notice. I know where you keep your stuff.',
  'I came down there. Took some things from your storage box to cover it. We\'re square. For now.',
];

export function landlordDay(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  if (ctx.day % 7 !== 0) return [];
  const owner = state.ownerId;
  const p = state.players[owner];
  if (!p) return [];
  const L = { ...LANDLORD_START, ...(state.globals[LANDLORD_KEY] as Landlord | undefined) };
  const due = L.rent + L.debt;
  const out: Command[] = [];
  const note = (i: number) => msg(ctx.rng, owner, ctx.day, 24 * 60, i === 0 ? 'info' : i < 3 ? 'warn' : 'urgent', LANDLORD_TEXT[i]!, 'Landlord');
  if (p.cash >= due) {
    out.push({ type: 'playerUpdated', playerId: owner, patch: { cash: p.cash - due } });
    out.push({ type: 'globalSet', key: LANDLORD_KEY, value: { rent: Math.round(L.rent * 1.1), debt: 0, notices: 0 } });
    out.push(note(0));
    return out;
  }
  const notices = L.notices + 1;
  if (notices < 3) {
    out.push({ type: 'globalSet', key: LANDLORD_KEY, value: { ...L, debt: due, notices } });
    out.push(note(notices));
    return out;
  }
  // The repo: up to three things from the apartment's storage box, and the slate is wiped.
  const home = state.floors[APARTMENT_FLOOR];
  const room = home && state.rooms[home.lobbyRoomId];
  const box = room?.furniture.find((f) => f.contents?.some(Boolean));
  if (room && box?.contents) {
    const contents = [...box.contents];
    const filled = contents.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    for (const i of ctx.rng.shuffle(filled).slice(0, 3)) contents[i] = null;
    out.push({ type: 'furnitureUpdated', roomId: room.id, placement: { ...box, contents } });
  }
  out.push({ type: 'globalSet', key: LANDLORD_KEY, value: { rent: L.rent, debt: 0, notices: 0 } });
  out.push(note(3));
  return out;
}

export function registerTenants(): void {
  registerDaily('tenants', tenantsDay);
  registerTick('tenants', tenantsTick);
}

/** A readable line for a preference ("Likes plants", "Hates bright rooms"…). */
export function describePref(p: Pref): string {
  const v = p.like ? 'Likes' : 'Dislikes';
  switch (p.kind) {
    case 'tag': return `${v} ${({ plant: 'plants', light: 'lamps', seat: 'places to sit', table: 'tables', storage: 'storage', music: 'music' } as Record<string, string>)[p.key!] ?? p.key}`;
    case 'floor': return `${v} ${p.key} floors`;
    case 'space': return p.like ? 'Wants a roomy place' : 'Wants a cosy place';
    case 'bright': return p.like ? 'Likes it bright' : 'Likes it dim';
    case 'quiet': return 'Wants to be left alone by monsters';
    case 'utility': return p.key === 'power' ? 'Needs power' : 'Needs running water';
  }
}
