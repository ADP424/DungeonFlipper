import type { Command, WorldState } from '@df/shared';

export interface SyncResult { revision: number; conflict: boolean; errors: string[] }

/** Thin HTTP client for the sync API. Network failures are reported as `null` (offline). */
export class SyncClient {
  constructor(private base = '/api') {}

  async fetchState(playerId: string): Promise<WorldState | null | 'missing'> {
    try {
      const res = await fetch(`${this.base}/state?playerId=${encodeURIComponent(playerId)}`);
      if (res.status === 404) return 'missing';
      if (!res.ok) return null;
      return (await res.json()).state as WorldState;
    } catch {
      return null;
    }
  }

  async sync(playerId: string, baseRevision: number, commands: Command[], keepalive = false): Promise<SyncResult | 'needsFullSync' | null> {
    try {
      const res = await fetch(`${this.base}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId, baseRevision, commands }),
        keepalive,
      });
      if (res.status === 409) return 'needsFullSync';
      if (!res.ok) return null;
      return (await res.json()) as SyncResult;
    } catch {
      return null;
    }
  }
}
