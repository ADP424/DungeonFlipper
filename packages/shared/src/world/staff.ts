import { Rng, deriveSeed } from '../core/rng';
import { registerDaily } from './advance';
import { BARRICADE_TIERS } from './securing';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { getTenants, tenantUnit } from './tenants';
import type { WorldState } from './types';
import { UTILITY_KINDS } from './utilities';
import { cashText } from './cash';

/**
 * Staff (P7): people you pay by the day to look after your property. They work at the day's end,
 * abstractly (D26); when you're nearby they're NPCs doing the same jobs live (client).
 *   cleaner  – clears mess, tenants' units first
 *   handyman – fixes pipe / wire faults and patches up worn barricades
 */
export type StaffRole = 'cleaner' | 'handyman';
export const STAFF_ROLES: readonly StaffRole[] = ['cleaner', 'handyman'];

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  /** Cash a day, paid at the day's end. */
  wage: number;
  /** The floor whose property they look after. */
  floor: number;
  since: number;
}

export const STAFF_KEY = 'staff';
export const WAGES: Record<StaffRole, [number, number]> = { cleaner: [4, 6], handyman: [6, 9] };
/** What one of them gets through in a day. */
export const CLEANER_TILES = 15;
export const HANDYMAN_FAULTS = 4;
export const HANDYMAN_BARRICADES = 3;
/** Share of a barricade tier's HP a handyman patches back on. */
export const HANDYMAN_PATCH = 0.4;

export function getStaff(state: WorldState): Record<string, Staff> {
  return (state.globals[STAFF_KEY] as Record<string, Staff> | undefined) ?? {};
}

export const ROLE_NAME: Record<StaffRole, string> = { cleaner: 'Cleaner', handyman: 'Handyman' };

const FIRST = ['Bev', 'Gus', 'Marta', 'Ollie', 'Rosa', 'Theo', 'Ines', 'Dmitri', 'Hal', 'June', 'Pim', 'Wanda'];
const LAST = ['Fisk', 'Abara', 'Moreau', 'Quill', 'Banks', 'Szabo', 'Ruiz', 'Vance', 'Toft', 'Nakamura'];

/** Today's people looking for work: two per role, the same all day. */
export function staffCandidates(state: WorldState, day: number): Staff[] {
  const rng = new Rng(deriveSeed(state.seed, `staff:${day}`));
  const out: Staff[] = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 2; i++) {
      const [lo, hi] = WAGES[role];
      out.push({ id: `s${day}-${role}-${i}`, name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, role, wage: rng.int(lo, hi), floor: 1, since: day });
    }
  }
  const hired = new Set(Object.keys(getStaff(state)));
  return out.filter((s) => !hired.has(s.id));
}

/**
 * The day ends: staff are paid (whoever can't be, quits), then they work. Cleaners take mess in
 * tenants' units first, then anywhere else you own on their floor; handymen fix faults, then patch
 * the most worn barricades.
 */
export function staffDay(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  const out: Command[] = [];
  const owner = state.ownerId;
  const staff = Object.values(getStaff(state));
  if (!staff.length) return out;
  let cash = state.players[owner]?.cash ?? 0;
  const msg = (text: string, severity: 'info' | 'warn' = 'info'): Command => ({
    type: 'messagePosted', playerId: owner,
    message: { id: `staff${ctx.day}-${Math.floor(ctx.rng.next() * 2 ** 31).toString(36)}`, day: ctx.day, minute: 24 * 60, severity, text, from: 'Staff' },
  });
  const working: Staff[] = [];
  let paid = 0;
  for (const s of staff) {
    if (cash < s.wage) {
      out.push({ type: 'staffRemoved', id: s.id });
      out.push(msg(`${s.name} (${ROLE_NAME[s.role].toLowerCase()}) quit: you couldn't pay their ${cashText(s.wage)}.`, 'warn'));
      continue;
    }
    cash -= s.wage;
    paid += s.wage;
    working.push(s);
  }
  if (paid) out.push({ type: 'playerUpdated', playerId: owner, patch: { cash } });

  const owned = (floor: number) => Object.values(state.rooms).filter((r) => r.ownerId === owner && r.floor === floor && r.floor !== APARTMENT_FLOOR);
  let cleaned = 0, fixed = 0, patched = 0;
  for (const s of working) {
    const rooms = owned(s.floor);
    if (s.role === 'cleaner') {
      // Tenants' units first.
      const unitTiles = new Set<string>();
      for (const t of Object.values(getTenants(state))) {
        const u = t.status === 'living' ? tenantUnit(state, t) : null;
        if (u && u.floor === s.floor) for (const k of u.tiles) unitTiles.add(k);
      }
      const messy = rooms.flatMap((r) => Object.keys(r.mess ?? {}).map((k) => ({ roomId: r.id, k })));
      messy.sort((a, b) => Number(unitTiles.has(b.k)) - Number(unitTiles.has(a.k)));
      for (const { roomId, k } of messy.slice(0, CLEANER_TILES)) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        out.push({ type: 'messCleared', roomId, x, y });
        cleaned++;
      }
    } else {
      let faults = 0;
      for (const r of rooms) {
        for (const [k, t] of Object.entries(r.utilities ?? {})) {
          for (const kind of UTILITY_KINDS) {
            if (!t[kind]?.fault || faults >= HANDYMAN_FAULTS) continue;
            const [x, y] = k.split(',').map(Number) as [number, number];
            out.push({ type: 'utilityFault', roomId: r.id, x, y, kind, fault: false });
            faults++;
          }
        }
      }
      fixed += faults;
      const worn = rooms
        .flatMap((r) => Object.entries(r.barricades).map(([k, b]) => ({ roomId: r.id, k, b, frac: b.hp / BARRICADE_TIERS[b.tier]!.hp })))
        .filter((w) => w.frac < 1)
        .sort((a, b) => a.frac - b.frac);
      const done = new Set<string>();
      for (const w of worn) {
        if (done.size >= HANDYMAN_BARRICADES) break;
        // Mirrored doorways: patch one side (barricadeSet mirrors it).
        if (done.has(w.k)) continue;
        done.add(w.k);
        const max = BARRICADE_TIERS[w.b.tier]!.hp;
        out.push({ type: 'barricadeSet', roomId: w.roomId, door: w.k, barricade: { tier: w.b.tier, hp: Math.min(max, Math.round(w.b.hp + max * HANDYMAN_PATCH)) } });
        patched++;
      }
    }
  }
  const parts = [];
  if (paid) parts.push(`Wages: -${cashText(paid)}.`);
  if (cleaned) parts.push(`Cleaned ${cleaned} messy spot${cleaned === 1 ? '' : 's'}.`);
  if (fixed) parts.push(`Fixed ${fixed} fault${fixed === 1 ? '' : 's'}.`);
  if (patched) parts.push(`Patched ${patched} barricade${patched === 1 ? '' : 's'}.`);
  if (parts.length) out.push(msg(parts.join(' ')));
  return out;
}

export function registerStaff(): void {
  registerDaily('staff', staffDay);
}
