import {
  SaveTooOldError, applyCommand, emptyWorld, migrate, newWorldCommands, uid, type Command, type WorldState,
} from '@df/shared';
import { SyncClient } from '../net/SyncClient';

const LS_PLAYER = 'df.playerId';
const LS_WORLD = 'df.world';
const LS_OUTBOX = 'df.outbox';
const LS_EPOCH = 'df.devEpoch';
const FLUSH_INTERVAL_MS = 15000;
/**
 * Dev builds only: bump to make every dev browser drop its local save (world, outbox and player id)
 * on its next load, so testing starts from a new game. Pair it with deleting the dev server's
 * database (`apps/server/data/`), or the old world would come back from the server.
 */
const DEV_SAVE_EPOCH = 12;

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable or full */ }
}

/**
 * Owns the world state on the client. Every persistent change goes through `dispatch(cmd)`:
 * applied locally with the shared reducer, saved to localStorage, queued in an outbox and
 * flushed to the server on room transitions, periodically, and when the page is hidden.
 */
export class Session {
  state: WorldState = emptyWorld();
  playerId: string;
  private outbox: Command[] = [];
  private saveTimer: number | null = null;
  private flushing = false;
  online = false;
  /** Bumped on every dispatched command: views that summarise the world (maps) redraw when it changes. */
  changes = 0;
  readonly sync = new SyncClient();

  private constructor() {
    let id = lsGet(LS_PLAYER);
    if (!id) {
      id = uid();
      lsSet(LS_PLAYER, id);
    }
    this.playerId = id;
  }

  static async boot(): Promise<Session> {
    if (import.meta.env.DEV && lsGet(LS_EPOCH) !== String(DEV_SAVE_EPOCH)) {
      try {
        for (const k of [LS_WORLD, LS_OUTBOX, LS_PLAYER]) localStorage.removeItem(k);
      } catch { /* storage unavailable */ }
      lsSet(LS_EPOCH, String(DEV_SAVE_EPOCH));
    }
    const s = new Session();
    // Saves too old to upgrade are dropped: the game starts over.
    const load = (raw: Record<string, unknown>): WorldState | null => {
      try {
        return migrate(raw);
      } catch (e) {
        if (e instanceof SaveTooOldError) return null;
        throw e;
      }
    };
    const local = lsGet(LS_WORLD);
    const localState = local ? load(JSON.parse(local)) : null;
    if (localState) {
      s.state = localState;
      s.outbox = JSON.parse(lsGet(LS_OUTBOX) ?? '[]');
    } else {
      const remote = await s.sync.fetchState(s.playerId);
      const remoteState = remote && remote !== 'missing' ? load(remote as unknown as Record<string, unknown>) : null;
      if (remoteState) {
        s.state = remoteState;
        s.online = true;
      } else {
        for (const c of newWorldCommands(s.playerId)) s.dispatch(c);
      }
    }
    s.saveNow();
    void s.flush();
    window.setInterval(() => { if (s.outbox.length) void s.flush(); }, FLUSH_INTERVAL_MS);
    window.addEventListener('pagehide', () => { s.saveNow(); void s.flush(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { s.saveNow(); void s.flush(true); } });
    return s;
  }

  get player() {
    return this.state.players[this.playerId]!;
  }

  dispatch(cmd: Command): void {
    cmd.actorId ??= this.playerId;
    cmd.at ??= Date.now();
    applyCommand(this.state, cmd);
    this.changes++;
    // Coalesce consecutive player patches so frequent HP/hotbar updates don't flood the outbox.
    const last = this.outbox[this.outbox.length - 1];
    if (cmd.type === 'playerUpdated' && last?.type === 'playerUpdated' && last.playerId === cmd.playerId && !this.flushing) {
      last.patch = { ...last.patch, ...structuredClone(cmd.patch) };
    } else {
      this.outbox.push(structuredClone(cmd));
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer != null) return;
    this.saveTimer = window.setTimeout(() => this.saveNow(), 400);
  }

  saveNow(): void {
    if (this.saveTimer != null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    lsSet(LS_WORLD, JSON.stringify(this.state));
    lsSet(LS_OUTBOX, JSON.stringify(this.outbox));
  }

  /** Send queued commands. Safe to call often; concurrent calls are ignored. */
  async flush(keepalive = false): Promise<void> {
    if (this.flushing || this.outbox.length === 0) return;
    this.flushing = true;
    const batch = this.outbox.slice();
    try {
      let res = await this.sync.sync(this.playerId, this.state.revision, batch, keepalive);
      if (res === 'needsFullSync') {
        // Server has no record of this world (e.g. its DB was reset): upload a full snapshot.
        res = await this.sync.sync(this.playerId, 0, snapshotCommands(this.state), keepalive);
        if (res && res !== 'needsFullSync') this.outbox.splice(0, batch.length);
      } else if (res) {
        this.outbox.splice(0, batch.length);
      }
      this.online = !!res && res !== 'needsFullSync';
      if (res && res !== 'needsFullSync') {
        this.state.revision = res.revision;
        if (res.errors.length) console.warn('Sync errors', res.errors);
      }
      this.saveNow();
    } finally {
      this.flushing = false;
    }
  }

  /** Wipe local progress and start a new world (dev / settings). */
  resetWorld(): void {
    try {
      localStorage.removeItem(LS_WORLD);
      localStorage.removeItem(LS_OUTBOX);
      localStorage.removeItem(LS_PLAYER);
    } catch { /* ignore */ }
    location.reload();
  }
}

/** Commands that rebuild the given world from nothing (used to re-seed a server). */
export function snapshotCommands(state: WorldState): Command[] {
  const at = Date.now();
  const cmds: Command[] = [{ type: 'worldCreated', worldId: state.worldId, ownerId: state.ownerId, seed: state.seed, createdAt: state.createdAt, at }];
  for (const floor of Object.values(state.floors)) {
    const rooms = Object.keys(floor.rooms).map((id) => state.rooms[id]!).filter(Boolean);
    cmds.push({ type: 'floorGenerated', floor, rooms, at });
  }
  for (const p of Object.values(state.players)) cmds.push({ type: 'playerCreated', player: p, at });
  for (const [key, value] of Object.entries(state.globals)) cmds.push({ type: 'globalSet', key, value, at });
  return cmds;
}
