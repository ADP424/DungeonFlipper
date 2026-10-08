import type { Command } from './commands';
import type { WorldState } from './types';

/**
 * Off-screen processes (cooking, NPC schedules, growth…) are stored as timestamped state in
 * `globals` and resolved lazily here when the world is loaded or a room is entered, rather than
 * simulating unseen rooms continuously.
 *
 * Each resolver inspects state and returns commands that bring it up to `now`. The result is
 * applied through the normal reducer, so the server and other clients see the same outcome.
 */
export type GlobalResolver = (state: WorldState, now: number) => Command[];

const resolvers: GlobalResolver[] = [];

export function registerResolver(r: GlobalResolver): void {
  resolvers.push(r);
}

export function advance(state: WorldState, now: number): Command[] {
  return resolvers.flatMap((r) => r(state, now));
}
