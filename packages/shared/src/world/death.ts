import { cashText } from './cash';
import type { Command } from './commands';
import { LANDLORD_KEY, LANDLORD_START, type Landlord } from './tenants';
import type { WorldState } from './types';

/**
 * Death (D15) costs time and money, never what you carried: you're out cold until the next morning
 * while the world carries on without you, and the landlord bills you for hauling you out of your
 * closet. What you can't pay goes onto the rent you owe (D8).
 */
export const RESCUE_FEE_BASE = 10;
/** Added per floor down: the deeper you fell, the further you had to be dragged. */
export const RESCUE_FEE_PER_FLOOR = 15;

export const rescueFee = (floor: number): number => RESCUE_FEE_BASE + RESCUE_FEE_PER_FLOOR * Math.max(0, floor);

/** The landlord's call-out fee, split into what was taken from your cash and what went onto your rent. */
export interface RescueBill { fee: number; paid: number; owed: number }

export interface Death {
  playerId: string;
  /** The floor they died on. */
  floor: number;
  respawn: { floor: number; roomId: string; x: number; y: number };
  redHalves: number;
}

/** A player dies: they reappear at `respawn` with everything they carried, and are billed. */
export function deathCommands(state: WorldState, d: Death): { commands: Command[]; bill: RescueBill } {
  const fee = rescueFee(d.floor);
  const cash = state.players[d.playerId]?.cash ?? 0;
  const paid = Math.min(cash, fee);
  const bill: RescueBill = { fee, paid, owed: fee - paid };
  const commands: Command[] = [{ type: 'playerDied', playerId: d.playerId, respawn: d.respawn, redHalves: d.redHalves }];
  if (bill.paid) commands.push({ type: 'playerUpdated', playerId: d.playerId, patch: { cash: cash - bill.paid } });
  if (bill.owed) {
    const L = { ...LANDLORD_START, ...(state.globals[LANDLORD_KEY] as Landlord | undefined) };
    commands.push({ type: 'globalSet', key: LANDLORD_KEY, value: { ...L, debt: L.debt + bill.owed } });
  }
  return { commands, bill };
}

/** The landlord's text about it. */
export function rescueNote(bill: RescueBill): string {
  const found = `Found you face down in your closet again. Call-out fee: ${cashText(bill.fee)}.`;
  if (!bill.owed) return `${found} Took it from your account.`;
  return `${found} You're short, so ${cashText(bill.owed)} goes on your rent.`;
}
