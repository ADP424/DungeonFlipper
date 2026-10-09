import { Rng, deriveSeed } from '../core/rng';
import { MINUTES_PER_TICK, absoluteMinute, type Clock } from './clock';
import type { Command } from './commands';
import type { WorldState } from './types';

/**
 * Off-screen processes (barricade wear, monsters moving in, rent, tenant jobs…) never simulate unseen
 * rooms. Instead they register here and are resolved when the clock moves: tick resolvers once per
 * 15-minute tick crossed, daily resolvers when the player sleeps. Nothing runs on any other schedule.
 *
 * Resolvers only *return* commands; the caller dispatches them through the normal reducer, so the
 * server (which replays commands, not resolvers) and other clients see the same outcome. Their
 * randomness comes from `ctx.rng`, seeded by world seed, time and resolver key, so it is stable.
 */
export interface TickCtx {
  /** Ticks since day 1's midnight, identifying the tick that just began. */
  tick: number;
  /** Clock at that tick, on the day being advanced (minute may exceed 1440 overnight). */
  clock: Clock;
  rng: Rng;
  /**
   * Rooms the player is walking between on this tick's screen transition: monsters neither come out of
   * nor go into them, so the room you just cleared isn't refilled from the one you're stepping into.
   */
  quiet?: ReadonlySet<string>;
}

export interface DayCtx {
  /** The day that just ended. */
  day: number;
  rng: Rng;
}

export type TickResolver = (state: WorldState, ctx: TickCtx) => Command[];
export type DailyResolver = (state: WorldState, ctx: DayCtx) => Command[];

const tickers = new Map<string, TickResolver>();
const daily = new Map<string, DailyResolver>();

/** Register (or replace) a per-tick resolver under a stable key; the key also seeds its rng. */
export function registerTick(key: string, r: TickResolver): void {
  tickers.set(key, r);
}

export function registerDaily(key: string, r: DailyResolver): void {
  daily.set(key, r);
}

export function unregisterResolver(key: string): void {
  tickers.delete(key);
  daily.delete(key);
}

/**
 * Run the resolvers for the time between `from` and `to`. Every tick boundary in (from, to] fires the
 * tick resolvers, in order; when `endedDay` is given (the player slept), the daily resolvers fire
 * after the ticks. Each command is passed to `dispatch` immediately, so later resolvers see its effect.
 * The clock itself is not changed here.
 */
export function advanceClock(
  state: WorldState,
  from: Clock,
  to: Clock,
  dispatch: (cmd: Command) => void,
  endedDay?: number,
  quiet?: ReadonlySet<string>,
): void {
  const a = absoluteMinute(from);
  const b = absoluteMinute(to);
  for (let t = Math.floor(a / MINUTES_PER_TICK) + 1; t * MINUTES_PER_TICK <= b; t++) {
    // Expressed on the day being advanced (minute runs past 1440 overnight, like the clock itself).
    const clock = { day: from.day, minute: t * MINUTES_PER_TICK - (from.day - 1) * 1440 };
    for (const [key, r] of tickers) {
      const rng = new Rng(deriveSeed(state.seed, `tick:${t}:${key}`));
      for (const c of r(state, { tick: t, clock, rng, quiet })) dispatch(c);
    }
  }
  if (endedDay !== undefined) {
    for (const [key, r] of daily) {
      const rng = new Rng(deriveSeed(state.seed, `day:${endedDay}:${key}`));
      for (const c of r(state, { day: endedDay, rng })) dispatch(c);
    }
  }
}
