import type { Rng } from '../core/rng';
import { registerDaily, registerTick } from './advance';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { roomLabel } from './securing';
import { findSign, signs, unitAt, unitStats, type Unit, type UnitStats } from './units';
import type { WorldState } from './types';
import { openings } from './area';
import { CELL_H, CELL_W } from '../core/constants';
import { RoomLayout } from './layout';
import { HAPPY_MOOD, REP, getReputation, infamyFactor, repTier } from './reputation';
import { undercutBy } from './realtors';
import { cashText } from './cash';

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
  /** Household (P7): how many people, and their names (the first is who you deal with). Default 1. */
  size?: number;
  members?: string[];
  /** Rent they've held back while unhappy (they pay it back once they cheer up). */
  arrears?: number;
  /** Under notice: they leave at the end of this day. Fair if they were behind on rent or miserable. */
  evictDay?: number;
  evictFair?: boolean;
  /** What they've complained about, and since when (left 2+ days, it costs reputation). */
  complaint?: { issue: Issue; since: number };
}

export type Issue = 'mess' | 'power' | 'water' | 'insecure';

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

/** Rent (and the tier's ceiling) scale with household size: a family of 4 pays 2.6× a single. */
export const HOUSEHOLD_MUL = [0, 1, 1.6, 2.2, 2.6];
/** Households: 60% singles, 25% couples, 15% families of 3–4. */
function rollSize(rng: Rng): number {
  const r = rng.next();
  return r < 0.6 ? 1 : r < 0.85 ? 2 : rng.int(3, 4);
}
export const householdSize = (t: Tenant): number => t.size ?? 1;

/** "Single", "Couple", "Family of 4". */
export function householdLabel(t: Tenant): string {
  const n = householdSize(t);
  return n === 1 ? 'Single' : n === 2 ? 'Couple' : `Family of ${n}`;
}

/** Whether mess can land on a tile: open floor (no hole, obstacle or furniture). */
export function messable(state: WorldState, roomId: string, x: number, y: number): boolean {
  const st = state.rooms[roomId];
  const info = st && state.floors[st.floor]?.rooms[roomId];
  return !!info && new RoomLayout(info, st).isOpenFloor(x, y);
}

/** Below this mood, tenants hold back the rent. */
export const WITHHOLD_MOOD = 25;
/** Under this mood (or with arrears), an eviction is fair. */
export const FAIR_EVICT_MOOD = 30;
export const NOTICE_DAYS = 3;
/** Messy tiles in a unit before its tenants complain. */
export const MESS_COMPLAINT = 6;

/**
 * A new applicant of the given tier (reputation unlocks higher ones, D44): a household of 1–4 with
 * 3–4 preferences (one more from tier 2), the first 1–2 of which you're told up front (D32).
 */
export function makeApplicant(rng: Rng, id: string, signUid: string, floor: number, day: number, tier = 1): Tenant {
  const prefs: Pref[] = [];
  const pool: Pref[] = rng.shuffle([
    ...TAG_PREFS.map((key) => ({ kind: 'tag' as const, key, like: rng.chance(0.75) })),
    { kind: 'floor', key: 'carpet', like: rng.chance(0.6) },
    { kind: 'floor', key: 'wood', like: rng.chance(0.6) },
    { kind: 'space', like: rng.chance(0.5) },
    { kind: 'bright', like: rng.chance(0.7) },
  ]);
  const n = rng.int(3, 4) + (tier >= 2 ? 1 : 0);
  for (const p of pool) {
    if (prefs.length >= n - 1) break;
    if (prefs.some((q) => q.kind === p.kind && q.key === p.key)) continue;
    prefs.push(p);
  }
  // Everyone wants to be left alone by monsters; it's usually not what they lead with.
  prefs.splice(rng.int(1, prefs.length), 0, { kind: 'quiet', like: true });
  // Some won't live without power or running water (P6).
  if (rng.chance(UTILITY_NEED_CHANCE)) prefs.splice(rng.int(0, prefs.length), 0, { kind: 'utility', key: rng.chance(0.5) ? 'power' : 'water', like: true });
  const size = rollSize(rng);
  const last = rng.pick(LAST);
  const members = Array.from({ length: size }, () => rng.pick(FIRST));
  const name = size === 1 ? `${members[0]} ${last}` : size === 2 ? `${members[0]} & ${members[1]} ${last}` : `The ${last}s`;
  return {
    id, name, tier, prefs, known: rng.int(1, 2),
    signUid, floor, status: 'applicant', rent: 0, mood: 60, strikes: 0, since: day, size, members,
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
  if (!fitsHousehold(t, s) || missingNeed(t, s)) return 0;
  const [base, cap] = TIER_RENT[t.tier] ?? TIER_RENT[1]!;
  const mul = HOUSEHOLD_MUL[householdSize(t)] ?? 1;
  const score = t.prefs.reduce((sum, p) => sum + prefScore(p, s), 0);
  // Everyone pays more for power and running water, and less for a mess.
  const utilities = (s.power ? 0.15 : 0) + (s.water ? 0.15 : 0);
  const mess = Math.max(0.5, 1 - 0.04 * s.mess);
  return Math.max(1, Math.min(Math.round(cap * mul), Math.round(base * mul * (1 + 0.3 * score + utilities) * mess)));
}

/** Enough sleeping spots for everyone, and families need at least two beds. */
export function fitsHousehold(t: Tenant, s: UnitStats): boolean {
  const n = householdSize(t);
  return s.beds >= 1 && s.sleeps >= n && (n < 3 || s.beds >= 2);
}

/** The top of the haggling slider for a tenant: comfortably above anything they'd pay. */
export function offerCap(t: Tenant): number {
  const cap = (TIER_RENT[t.tier] ?? TIER_RENT[1]!)[1] * (HOUSEHOLD_MUL[householdSize(t)] ?? 1);
  return Math.max(MAX_OFFER, Math.ceil(cap * 1.3));
}

/** What a tenant would complain about right now (the most pressing first). */
export function currentIssue(t: Tenant, s: UnitStats): Issue | null {
  if (!s.secure) return 'insecure';
  const need = missingNeed(t, s);
  if (need) return need;
  if (s.mess >= MESS_COMPLAINT) return 'mess';
  return null;
}

const COMPLAINTS: Record<Issue, string> = {
  insecure: "Things keep scratching at the doors. Is this place even secure?",
  power: "The power's out. I can't live like this.",
  water: "No running water. Seriously?",
  mess: "This place is a tip. Can somebody clean it up?",
};

/** How a tenant takes a rent offer (D18). */
export function haggle(value: number, offer: number): { result: 'accept' | 'counter' | 'refuse'; counter?: number; mood: number } {
  if (offer <= value) return { result: 'accept', mood: Math.round(50 + 40 * (1 - offer / Math.max(1, value))) };
  if (offer <= value * 1.25) return { result: 'counter', counter: value, mood: 0 };
  return { result: 'refuse', mood: 0 };
}

/** TEMPORARY (testing): every valid listing draws an applicant each night. Set back to false to restore the odds. */
export const TEMP_ALWAYS_APPLY = true;

/** Chance a listed unit draws an applicant today: 50% with nothing unsecured around it, less per unsecured neighbour, more so if it has monsters. */
export function applicantChance(s: UnitStats): number {
  if (TEMP_ALWAYS_APPLY) return 1;
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
  let rep = 0;
  let happy = 0;
  const taken = new Set<string>();
  /** Units with a household living in them (one per unit). */
  const occupied = new Set<string>();
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
    if (unit) occupied.add(unit.key);
    if (t.evictDay !== undefined && day >= t.evictDay) {
      out.push({ type: 'tenantRemoved', id: t.id });
      out.push(msg(rng, owner, day, minute, 'info', `${t.name} moved out of ${where}, as you told them to.`));
      if (!t.evictFair) {
        rep += REP.unfairEviction;
        out.push(msg(rng, owner, day, minute, 'warn', `Word gets around: evicting ${t.name} for no good reason hurt your reputation.`));
      }
      continue;
    }
    if (t.trapped !== undefined && unit?.rooms.some((id) => state.rooms[id]?.monsters.length)) {
      out.push({ type: 'tenantRemoved', id: t.id });
      rep += REP.death;
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
    if (!fitsHousehold(t, s)) mood -= 15;
    mood -= Math.min(10, Math.floor(s.mess / 3));
    if (t.evictDay !== undefined) mood -= 10;
    mood = Math.max(-10, Math.min(100, Math.round(mood)));
    if (mood < 0) {
      out.push({ type: 'tenantRemoved', id: t.id });
      out.push(msg(rng, owner, day, minute, 'warn', `${t.name} moved out of ${where}. They weren't happy there.`));
      rep += REP.leftUnhappy;
      continue;
    }
    // Complaints: said once; left unresolved for two days or more, they cost reputation daily.
    const issue = currentIssue(t, s);
    let complaint = t.complaint;
    if (!issue) complaint = undefined;
    else if (complaint?.issue !== issue) {
      complaint = { issue, since: day };
      out.push(msg(rng, owner, day, minute, 'warn', COMPLAINTS[issue], t.name));
    } else if (day - complaint.since >= 2) rep += REP.ignoredComplaint;
    // Rent: held back while they're miserable; paid back once they're content again.
    let arrears = t.arrears ?? 0;
    if (mood < WITHHOLD_MOOD) {
      if (!arrears) out.push(msg(rng, owner, day, minute, 'warn', `${t.name} is holding back the rent until things improve.`));
      arrears += t.rent;
    } else {
      income += t.rent;
      payers++;
      if (arrears && mood >= 50) {
        income += arrears;
        out.push(msg(rng, owner, day, minute, 'info', `${t.name} paid back the ${cashText(arrears)} they owed.`));
        arrears = 0;
      }
    }
    if (mood >= HAPPY_MOOD) happy += REP.happy;
    // Life makes a mess: each member, most days, somewhere in the unit.
    const tiles = [...unit.tiles];
    for (let i = 0; i < householdSize(t); i++) {
      if (!tiles.length || !rng.chance(0.7)) continue;
      const [x, y] = rng.pick(tiles).split(',').map(Number) as [number, number];
      const roomId = state.floors[unit.floor]!.cells[`${Math.floor(x / CELL_W)},${Math.floor(y / CELL_H)}`];
      // Only on open floor: not in a hole, on a wall or under furniture.
      if (roomId && messable(state, roomId, x, y)) out.push({ type: 'messAdded', roomId, x, y });
    }
    out.push({ type: 'tenantSet', tenant: { ...t, mood, trapped: undefined, arrears: arrears || undefined, complaint } });
  }
  rep += Math.min(REP.dailyGainCap, happy);
  if (rep) out.push({ type: 'reputationAdded', playerId: owner, delta: rep });
  if (income > 0) {
    const cash = state.players[owner]?.cash ?? 0;
    out.push({ type: 'playerUpdated', playerId: owner, patch: { cash: cash + income } });
    out.push(msg(rng, owner, day, minute, 'info', `Rent: +${cashText(income)} from ${payers} tenant${payers === 1 ? '' : 's'}.`));
  }
  // New applicants for open listings without anyone in them.
  for (const floor of Object.values(state.floors)) {
    if (floor.index === APARTMENT_FLOOR) continue;
    for (const sign of signs(state, floor.index)) {
      if (!sign.open || taken.has(sign.f.uid)) continue;
      const unit = unitAt(state, floor.index, sign.f.x, sign.f.y);
      if (!unit || occupied.has(unit.key)) continue;
      const s = unitStats(state, unit);
      const infamy = TEMP_ALWAYS_APPLY ? 1 : infamyFactor(getReputation(state, owner));
      if (s.beds < 1 || !s.connected || !rng.chance(applicantChance(s) * infamy)) continue;
      // A competitive or hostile realtor on the floor may undercut you for them.
      const rival = TEMP_ALWAYS_APPLY ? null : undercutBy(state, floor.index, s, rng);
      if (rival) {
        out.push(msg(rng, owner, day, minute, 'info', `Someone came to look at ${roomLabel(floor.rooms[unit.rooms[0]!]!)}, but ${rival.name} offered them a cheaper place.`, 'Listings'));
        continue;
      }
      // Your reputation tier sets who comes: mostly your top tier, sometimes a lower one.
      const top = repTier(getReputation(state, owner));
      const tier = top > 1 && rng.chance(0.4) ? rng.int(1, top - 1) : top;
      const a = makeApplicant(rng, rid(rng, 't'), sign.f.uid, floor.index, day + 1, tier);
      occupied.add(unit.key);
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
export function tenantsTick(state: WorldState, { clock }: { clock: { day: number; minute: number }; rng: Rng }): Command[] {
  const out: Command[] = [];
  for (const t of Object.values(getTenants(state))) {
    if (t.status !== 'living') continue;
    const unit = tenantUnit(state, t);
    if (!unit) continue;
    const invaded = unit.rooms.some((id) => state.rooms[id]?.monsters.length);
    if (!invaded) {
      if (t.displaced || t.trapped !== undefined) out.push({ type: 'tenantSet', tenant: { ...t, displaced: false, trapped: undefined } });
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
    out.push({ type: 'tenantSet', tenant: shelter ? { ...t, displaced: true } : { ...t, trapped: clock.day } });
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
