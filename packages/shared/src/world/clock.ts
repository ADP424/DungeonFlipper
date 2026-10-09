import type { WorldState } from './types';

/**
 * The world clock. It runs in real time while you play (MINUTES_PER_SECOND game minutes per real
 * second; paused in menus), committed in CLOCK_STEP-minute steps, and a day ends when the player sleeps. `minute` counts from midnight of the current day and runs
 * past 1440 after midnight (1:30 AM = 1530) until the player sleeps.
 */
export interface Clock {
  day: number;
  minute: number;
}

export const CLOCK_KEY = 'clock';
/** Everything off-screen happens on 15-minute ticks (or once a day). */
export const MINUTES_PER_TICK = 15;
/** Game minutes per real second while playing (Stardew Valley pace: a 6 AM–midnight day is 18 real minutes). */
export const MINUTES_PER_SECOND = 1;
/** The running clock is saved (and shown) in steps of this many minutes. Divides MINUTES_PER_TICK. */
export const CLOCK_STEP = 5;
/** 6 AM: day 1 starts here, and nobody wakes earlier. */
export const DAY_START_MINUTE = 6 * 60;
/** 12 AM: in a secure area you fall asleep on the spot. */
export const MIDNIGHT_MINUTE = 24 * 60;
/** 2 AM: still outside a secure area, you pass out (and die). */
export const PASS_OUT_MINUTE = 26 * 60;
export const SLEEP_MINUTES = 8 * 60;
/** Sleeping away from the home bed heals up to this fraction of max health. */
export const AWAY_SLEEP_HEAL_FRACTION = 2 / 3;

export function getClock(state: WorldState): Clock {
  const c = state.globals[CLOCK_KEY] as Clock | undefined;
  return c ? { day: c.day, minute: c.minute } : { day: 1, minute: DAY_START_MINUTE };
}

/** Minutes since the start of day 1's midnight; monotonic across sleeps. */
export function absoluteMinute(c: Clock): number {
  return (c.day - 1) * 1440 + c.minute;
}

/** When someone who falls asleep at `c` wakes: 8 hours later, but never before 6 AM the next day. */
export function wakeTime(c: Clock): Clock {
  return { day: c.day + 1, minute: Math.max(c.minute + SLEEP_MINUTES, 1440 + DAY_START_MINUTE) - 1440 };
}

export function addMinutes(c: Clock, minutes: number): Clock {
  return { day: c.day, minute: c.minute + minutes };
}

/** "11:45 PM", or "23:45" with `h24`. */
export function formatTime(minute: number, h24Clock = false): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  if (h24Clock) return `${String(h24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
