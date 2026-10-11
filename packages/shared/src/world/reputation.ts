import type { WorldState } from './types';

/**
 * Reputation (D20): one number per player, with tiers. Happy tenants raise it a little every day;
 * deaths, unfair evictions, tenants leaving unhappy and complaints left unanswered cost it. Tiers
 * unlock wealthier tenants (D44), whose higher ceilings are what make luxury renovation pay.
 */
export interface Reputation {
  points: number;
}

export const reputationKey = (playerId: string): string => `reputation:${playerId}`;

/** Points at which each tier starts (tier 1 at 0). */
export const REP_TIERS = [0, 40, 100];

export const REP = {
  /** Per household with mood ≥ HAPPY_MOOD, per day; capped at DAILY_GAIN_CAP a day. */
  happy: 1,
  dailyGainCap: 5,
  death: -25,
  unfairEviction: -10,
  leftUnhappy: -5,
  /** Per day a complaint has gone unresolved for 2+ days. */
  ignoredComplaint: -2,
} as const;

export const HAPPY_MOOD = 60;

export function getReputation(state: WorldState, playerId: string): number {
  return (state.globals[reputationKey(playerId)] as Reputation | undefined)?.points ?? 0;
}

/**
 * Below zero you're infamous (you've killed or robbed people, or evicted on a whim): applicants come
 * less often, down to a fifth as often at −80.
 */
export function infamyFactor(points: number): number {
  return points >= 0 ? 1 : Math.max(0.2, 1 + points / 100);
}

/** 1, 2 or 3. */
export function repTier(points: number): number {
  let tier = 1;
  REP_TIERS.forEach((min, i) => {
    if (points >= min) tier = i + 1;
  });
  return tier;
}

/** Points needed for the next tier, or null at the top. */
export function nextTierAt(points: number): number | null {
  return REP_TIERS.find((min) => min > points) ?? null;
}
