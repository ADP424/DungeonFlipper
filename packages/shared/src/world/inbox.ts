import type { WorldState } from './types';

/** A phone message: the digest of things that happened (sleep summaries, warnings, later breaches, rent…). */
export interface PhoneMessage {
  id: string;
  day: number;
  minute: number;
  severity: 'info' | 'warn' | 'urgent';
  /** Sender shown above the text (a contact name); absent for system notices. */
  from?: string;
  text: string;
}

export interface Inbox {
  messages: PhoneMessage[];
  unread: number;
}

export const inboxKey = (playerId: string): string => `inbox:${playerId}`;

export function getInbox(state: WorldState, playerId: string): Inbox {
  return (state.globals[inboxKey(playerId)] as Inbox | undefined) ?? { messages: [], unread: 0 };
}
