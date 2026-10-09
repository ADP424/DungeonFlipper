import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, expandRoom, getClock, newWorldCommands, type WorldState } from '@df/shared';
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
    const room = Object.values(state.rooms).find((r) => r.monsters.length >= 2)!;
    const roomId = room.id;
    const [killed, legacy] = room.monsters;
    res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      payload: {
        playerId: 'player-1',
        baseRevision: 1,
        commands: [
          { type: 'monsterKilled', roomId, monsterId: killed!.id },
          { type: 'monsterKilled', roomId, monsterId: legacy!.id },
          { type: 'timePassed', minutes: 15 },
        ],
      },
    });
    expect(res.json()).toMatchObject({ revision: 2, conflict: false, errors: [] });

    const row = store.db.prepare('SELECT rev, json FROM rooms WHERE room_id = ?').get(roomId) as { rev: number; json: string };
    expect(row.rev).toBe(2);
    const remaining = room.monsters.slice(2).map((m) => m.id);
    expect(JSON.parse(row.json).monsters.map((m: { id: string }) => m.id)).toEqual(remaining);
    const clockRow = store.db.prepare("SELECT json FROM globals WHERE key = 'clock'").get() as { json: string };
    expect(JSON.parse(clockRow.json)).toEqual({ day: 1, minute: 375 });
    const other = store.db.prepare('SELECT rev FROM rooms WHERE room_id != ? LIMIT 1').get(roomId) as { rev: number };
    expect(other.rev).toBe(1);
    await app.close();

    // Reopen from disk.
    const second = buildApp(dbPath);
    const reloaded = (await second.app.inject({ method: 'GET', url: '/api/state?playerId=player-1' })).json().state as WorldState;
    expect(reloaded.revision).toBe(2);
    expect(reloaded.rooms[roomId]!.monsters.map((m) => m.id)).toEqual(remaining);
    expect(getClock(reloaded)).toEqual({ day: 1, minute: 375 });
    expect(Object.keys(reloaded.rooms).length).toBe(Object.keys(state.rooms).length);
    await second.app.close();
  });

  it('treats a save too old to upgrade as no world, so a new game can start', async () => {
    const dbPath = join(dir, 'c.db');
    const first = buildApp(dbPath);
    await first.app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'p', baseRevision: 0, commands: newWorldCommands('p', 3) } });
    await first.app.close();

    const second = buildApp(dbPath);
    const world = second.store.db.prepare('SELECT id, json FROM worlds').get() as { id: string; json: string };
    second.store.db.prepare('UPDATE worlds SET json = ?').run(JSON.stringify({ ...JSON.parse(world.json), schemaVersion: 6 }));
    expect(second.store.load(world.id)).toBeUndefined();
    const res = await second.app.inject({ method: 'GET', url: '/api/state?playerId=p' });
    expect(res.statusCode).toBe(404);
    const fresh = await second.app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'p', baseRevision: 0, commands: newWorldCommands('p', 4) } });
    expect(fresh.json().errors).toEqual([]);
    const state = (await second.app.inject({ method: 'GET', url: '/api/state?playerId=p' })).json().state as WorldState;
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    await second.app.close();
  });

  it('stores floors as metadata plus region documents, and reassembles them', async () => {
    const dbPath = join(dir, 'd.db');
    const { app, store } = buildApp(dbPath);
    const cmds = newWorldCommands('r', 4);
    await app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'r', baseRevision: 0, commands: cmds } });
    const state = (await app.inject({ method: 'GET', url: '/api/state?playerId=r' })).json().state as WorldState;
    const floor = state.floors[1]!;
    const next = floor.rooms[floor.lobbyRoomId]!.doors[0]!.toRoom;
    const exp = expandRoom(floor, state.seed, next)!;
    const res = await app.inject({
      method: 'POST', url: '/api/sync',
      payload: { playerId: 'r', baseRevision: 1, commands: [{ type: 'roomsGenerated', floor: 1, infos: exp.infos, states: exp.states }] },
    });
    expect(res.json().errors).toEqual([]);
    const meta = JSON.parse((store.db.prepare('SELECT json FROM floors WHERE idx = 1').get() as { json: string }).json);
    expect(meta.rooms).toBeUndefined();
    expect(meta.lobbyRoomId).toBe(floor.lobbyRoomId);
    await app.close();

    const second = buildApp(dbPath);
    const reloaded = (await second.app.inject({ method: 'GET', url: '/api/state?playerId=r' })).json().state as WorldState;
    const all = Object.keys(reloaded.floors[1]!.rooms);
    expect(all.length).toBe(Object.keys(floor.rooms).length + exp.states.length);
    expect(reloaded.floors[1]!.rooms[next]!.expanded).toBe(true);
    for (const st of exp.states) expect(reloaded.rooms[st.id]).toBeDefined();
    await second.app.close();
  });

  it('rejects syncing an unknown world without a creation command', async () => {
    const { app } = buildApp(join(dir, 'b.db'));
    const res = await app.inject({ method: 'POST', url: '/api/sync', payload: { playerId: 'nobody', baseRevision: 0, commands: [] } });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
