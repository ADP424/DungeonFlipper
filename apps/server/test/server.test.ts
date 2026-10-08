import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { newWorldCommands, type WorldState } from '@df/shared';
import { buildApp } from '../src/app';

const dir = mkdtempSync(join(tmpdir(), 'df-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('server sync', () => {
  it('round-trips new world → sync → state, persisting only touched docs', async () => {
    const dbPath = join(dir, 'a.db');
    const { app, store } = buildApp(dbPath);
    const cmds = newWorldCommands('player-1', 7);

    let res = await app.inject({ method: 'GET', url: '/api/state?playerId=player-1' });
    expect(res.statusCode).toBe(404);

    res = await app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'player-1', baseRevision: 0, commands: cmds } });
    expect(res.statusCode).toBe(200);
    expect(res.json().revision).toBe(1);

    const state = (await app.inject({ method: 'GET', url: '/api/state?playerId=player-1' })).json().state as WorldState;
    const roomId = Object.keys(state.rooms)[2]!;
    res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      payload: { playerId: 'player-1', baseRevision: 1, commands: [{ type: 'enemyKilled', roomId, spawnId: '1,1' }] },
    });
    expect(res.json()).toMatchObject({ revision: 2, conflict: false, errors: [] });

    const row = store.db.prepare('SELECT rev, json FROM rooms WHERE room_id = ?').get(roomId) as { rev: number; json: string };
    expect(row.rev).toBe(2);
    expect(JSON.parse(row.json).deadSpawnIds).toEqual(['1,1']);
    const other = store.db.prepare('SELECT rev FROM rooms WHERE room_id != ? LIMIT 1').get(roomId) as { rev: number };
    expect(other.rev).toBe(1);
    await app.close();

    // Reopen from disk.
    const second = buildApp(dbPath);
    const reloaded = (await second.app.inject({ method: 'GET', url: '/api/state?playerId=player-1' })).json().state as WorldState;
    expect(reloaded.revision).toBe(2);
    expect(reloaded.rooms[roomId]!.deadSpawnIds).toEqual(['1,1']);
    expect(Object.keys(reloaded.rooms).length).toBe(Object.keys(state.rooms).length);
    await second.app.close();
  });

  it('migrates old saves on load and stores every migrated document', async () => {
    const dbPath = join(dir, 'c.db');
    const first = buildApp(dbPath);
    await first.app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'p', baseRevision: 0, commands: newWorldCommands('p', 3) } });
    await first.app.close();

    // Rewrite the stored docs as a version-1 save: a shield in the off hand and a tool counted in halves.
    const { store } = buildApp(dbPath);
    const world = store.db.prepare('SELECT id, json FROM worlds').get() as { id: string; json: string };
    store.db.prepare('UPDATE worlds SET json = ?').run(JSON.stringify({ ...JSON.parse(world.json), schemaVersion: 1 }));
    const prow = store.db.prepare('SELECT json FROM players').get() as { json: string };
    const player = JSON.parse(prow.json);
    player.hotbar.off = { uid: 's', defId: 'wooden_shield', data: {} };
    player.hotbar.slots[0] = { uid: 'h', defId: 'hammer', data: { halves: 5 } };
    store.db.prepare('UPDATE players SET json = ?').run(JSON.stringify(player));

    const migrated = store.load(world.id)!;
    expect(migrated.players.p!.hotbar.off).toBeNull();
    expect(migrated.players.p!.hotbar.slots[0]!.data).toEqual({ count: 5 });
    const stored = JSON.parse((store.db.prepare('SELECT json FROM players').get() as { json: string }).json);
    expect(stored.hotbar.off).toBeNull();
    expect(JSON.parse((store.db.prepare('SELECT json FROM worlds').get() as { json: string }).json).schemaVersion).toBe(2);
    store.close();
  });

  it('rejects syncing an unknown world without a creation command', async () => {
    const { app } = buildApp(join(dir, 'b.db'));
    const res = await app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'nobody', baseRevision: 0, commands: [] } });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
