import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_VERSION, emptyWorld, migrate, type DocKey, type WorldState } from '@df/shared';

// Loaded via require: some bundlers (Vite/Vitest) don't yet recognise the `node:sqlite` builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * SQLite persistence with one JSON document per world / floor / room / player / global key, so a
 * sync only rewrites the documents its commands touched. Large floors cost nothing to sync until
 * their rooms change.
 */
export class Store {
  readonly db: DatabaseSyncType;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS worlds (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, seed INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0, json TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS worlds_owner ON worlds(owner_id);
      CREATE TABLE IF NOT EXISTS floors (world_id TEXT, idx INTEGER, json TEXT NOT NULL, PRIMARY KEY (world_id, idx));
      CREATE TABLE IF NOT EXISTS rooms (world_id TEXT, room_id TEXT, floor INTEGER, rev INTEGER, json TEXT NOT NULL, PRIMARY KEY (world_id, room_id));
      CREATE TABLE IF NOT EXISTS players (id TEXT, world_id TEXT, json TEXT NOT NULL, PRIMARY KEY (world_id, id));
      CREATE TABLE IF NOT EXISTS globals (world_id TEXT, key TEXT, json TEXT NOT NULL, PRIMARY KEY (world_id, key));
      CREATE TABLE IF NOT EXISTS command_log (world_id TEXT, rev INTEGER, json TEXT NOT NULL);
    `);
  }

  worldIdForOwner(ownerId: string): string | undefined {
    const row = this.db.prepare('SELECT id FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 1').get(ownerId) as
      | { id: string }
      | undefined;
    return row?.id;
  }

  /** Assemble a full world state from its documents. */
  load(worldId: string): WorldState | undefined {
    const w = this.db.prepare('SELECT json, revision FROM worlds WHERE id = ?').get(worldId) as
      | { json: string; revision: number }
      | undefined;
    if (!w) return undefined;
    const state: WorldState = { ...emptyWorld(), ...JSON.parse(w.json), revision: w.revision };
    for (const r of this.db.prepare('SELECT idx, json FROM floors WHERE world_id = ?').all(worldId) as { idx: number; json: string }[]) {
      state.floors[r.idx] = JSON.parse(r.json);
    }
    for (const r of this.db.prepare('SELECT room_id, json FROM rooms WHERE world_id = ?').all(worldId) as { room_id: string; json: string }[]) {
      state.rooms[r.room_id] = JSON.parse(r.json);
    }
    for (const r of this.db.prepare('SELECT id, json FROM players WHERE world_id = ?').all(worldId) as { id: string; json: string }[]) {
      state.players[r.id] = JSON.parse(r.json);
    }
    for (const r of this.db.prepare('SELECT key, json FROM globals WHERE world_id = ?').all(worldId) as { key: string; json: string }[]) {
      state.globals[r.key] = JSON.parse(r.json);
    }
    const before = state.schemaVersion;
    const migrated = migrate(state as unknown as Record<string, unknown>);
    // A migration may rewrite any document, so store them all once (without bumping the revision).
    if (before < SCHEMA_VERSION) {
      this.db.exec('BEGIN');
      try {
        this.writeDocs(migrated, allDocKeys(migrated), migrated.revision, Date.now());
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
    return migrated;
  }

  /** Write the given documents of `state` and bump the revision, in one transaction. */
  save(state: WorldState, keys: Iterable<DocKey>, commandsJson: string): number {
    const now = Date.now();
    const revision = state.revision + 1;
    this.db.exec('BEGIN');
    try {
      this.writeDocs(state, keys, revision, now);
      this.db.prepare('INSERT INTO command_log (world_id, rev, json) VALUES (?, ?, ?)').run(state.worldId, revision, commandsJson);
      // Keep the log bounded; it's for debugging and future replay, not the source of truth.
      this.db
        .prepare('DELETE FROM command_log WHERE world_id = ? AND rev < ?')
        .run(state.worldId, revision - 500);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    state.revision = revision;
    return revision;
  }

  /** Upsert the world row plus the given documents. Callers wrap this in a transaction. */
  private writeDocs(state: WorldState, keys: Iterable<DocKey>, revision: number, now: number): void {
    const { floors: _f, rooms: _r, players: _p, globals: _g, revision: _rev, ...meta } = state;
    this.db
      .prepare(
        `INSERT INTO worlds (id, owner_id, seed, revision, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(state.worldId, state.ownerId, state.seed, revision, JSON.stringify(meta), now);
    for (const key of keys) {
      const [kind, id] = splitKey(key);
      if (kind === 'floor') {
        this.db.prepare('INSERT OR REPLACE INTO floors (world_id, idx, json) VALUES (?, ?, ?)').run(state.worldId, Number(id), JSON.stringify(state.floors[Number(id)]));
      } else if (kind === 'room') {
        const room = state.rooms[id]!;
        this.db
          .prepare('INSERT OR REPLACE INTO rooms (world_id, room_id, floor, rev, json) VALUES (?, ?, ?, ?, ?)')
          .run(state.worldId, id, room.floor, revision, JSON.stringify(room));
      } else if (kind === 'player') {
        this.db.prepare('INSERT OR REPLACE INTO players (id, world_id, json) VALUES (?, ?, ?)').run(id, state.worldId, JSON.stringify(state.players[id]));
      } else if (kind === 'global') {
        this.db.prepare('INSERT OR REPLACE INTO globals (world_id, key, json) VALUES (?, ?, ?)').run(state.worldId, id, JSON.stringify(state.globals[id]));
      }
    }
  }

  close(): void {
    this.db.close();
  }
}

function allDocKeys(state: WorldState): DocKey[] {
  return [
    'world',
    ...Object.keys(state.floors).map((i): DocKey => `floor:${Number(i)}`),
    ...Object.keys(state.rooms).map((id): DocKey => `room:${id}`),
    ...Object.keys(state.players).map((id): DocKey => `player:${id}`),
    ...Object.keys(state.globals).map((k): DocKey => `global:${k}`),
  ];
}

function splitKey(key: DocKey): [string, string] {
  if (key === 'world') return ['world', ''];
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}
