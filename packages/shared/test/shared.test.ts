import { beforeAll, describe, expect, it } from 'vitest';
import {
  CELL_H, CELL_W, HealthStack, MAX_STACK, Rng, RoomLayout, SCHEMA_VERSION, WallBits, addToHotbar, applyCommands,
  countLeft, createItem, emptyWorld, expandRoom, generateFloor, initialRoomState, migrate,
  newWorldCommands, pickEntry, registerAllContent, registry, rollLoot, Stats, wallMask, wallQuarters,
  type Hotbar, type LootTableDef, type RoomInfo, type RoomState,
  advanceClock, applyCommand, getClock, getInbox, registerDaily, registerTick, unregisterResolver, wakeTime,
  SaveTooOldError, formatTime, isSecure, BARRICADE_TIERS, requiredTier, securingTick, securingDay, pressurePerTick, canStack, createItem as makeItem, partnerDoor,
  storeCatalog, furnitureCatalog, furnitureOrder, deliverOrders, getOrders, areaRooms, AreaLayout, structuralWallTarget, openings, doorStatuses, unitAt, unitStats, makeApplicant, valuation, haggle, applicantChance, tenantsDay, tenantsTick, landlordDay,
  getTenants, TIER_RENT, LANDLORD_START, LANDLORD_KEY, type Tenant, roomDifficulty, rollRoster, stairsDownRooms, regionKeyOf, threatBudget, threatCap,
  type Command, type FloorState, type WorldState,
  utilityNets, fixtureSupplied, utilitiesTick, contactTiles, missingNeed, FAULT_CHANCE,
  kitAccepts,
} from '../src';

beforeAll(() => registerAllContent());

describe('loot', () => {
  const table: LootTableDef = {
    id: 't',
    drops: [
      { chance: 0.5, entries: [{ chance: 0.5, item: 'sandwich' }, { chance: 0.25, cash: 5 }] },
      { chance: 1, entries: [{ chance: 1, item: 'box_cutter' }] },
    ],
  };

  it('picks exactly one entry, leftover gives nothing', () => {
    const entries = table.drops[0]!.entries;
    expect(pickEntry(entries, 0.1)).toBe(entries[0]);
    expect(pickEntry(entries, 0.6)).toBe(entries[1]);
    expect(pickEntry(entries, 0.9)).toBeUndefined();
  });

  it('matches the expected distribution', () => {
    const rng = new Rng(42);
    let hearts = 0, gold = 0, daggers = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      for (const r of rollLoot(table, rng)) {
        if (r.kind === 'item' && r.item === 'sandwich') hearts++;
        if (r.kind === 'cash') gold++;
        if (r.kind === 'item' && r.item === 'box_cutter') daggers++;
      }
    }
    expect(daggers).toBe(N);
    expect(hearts / N).toBeCloseTo(0.25, 1);
    expect(gold / N).toBeCloseTo(0.125, 1);
  });

  it('no loot table drops furniture any more', () => {
    for (const t of registry.lootTables.all()) for (const d of t.drops) for (const e of d.entries) expect('furniture' in e).toBe(false);
  });
});

describe('health', () => {
  it('drains armor before red hearts and breaks the armor', () => {
    const h = new HealthStack([
      { kind: 'red', current: 6, max: 6 },
      { kind: 'armor', current: 2, max: 2, boundItemUid: 'arm1' },
    ]);
    let r = h.damage(1);
    expect(h.get('armor')!.current).toBe(1);
    expect(h.get('red')!.current).toBe(6);
    r = h.damage(2);
    expect(r.brokenItems).toEqual(['arm1']);
    expect(h.get('armor')).toBeUndefined();
    expect(h.get('red')!.current).toBe(5);
    r = h.damage(10);
    expect(r.dead).toBe(true);
  });

  it('stats combine add and mul', () => {
    const s = new Stats();
    s.set('boots', [{ stat: 'moveSpeed', mul: 1.2 }]);
    s.set('x', [{ stat: 'moveSpeed', add: 0.5 }]);
    expect(s.get('moveSpeed')).toBeCloseTo((4.5 + 0.5) * 1.2);
  });
});

function emptyState(id: string): RoomState {
  return { id, floor: 1, ownerId: null, discovered: false, visited: false, monsters: [], barricades: {}, tileOverrides: {}, floorSurfaces: {}, wallSurfaces: {}, furniture: [], groundItems: [] };
}

describe('layout', () => {
  it('builds an L-shaped room with walls only on outer edges', () => {
    const info: RoomInfo = {
      id: 'L', floor: 1, templateId: 'l_bend', mirrorX: false, mirrorY: false,
      cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }], doors: [], tags: ['normal'], difficulty: 0, expanded: false,
    };
    const l = new RoomLayout(info, emptyState('L'));
    // Interior seam between (0,0) and (1,0) is open floor.
    expect(l.isBoundary(CELL_W - 1, 5)).toBe(false);
    expect(l.isBoundary(CELL_W, 5)).toBe(false);
    // Missing cell (1,1) is void.
    expect(l.kindAt(CELL_W + 5, CELL_H + 5)).toBe('void');
    // The bottom edge of cell (1,0) is a wall.
    expect(l.isBoundary(CELL_W + 5, CELL_H - 1)).toBe(true);
    // Outer border.
    expect(l.isBoundary(0, 0)).toBe(true);
  });

  it('applies the projectile blocking matrix', () => {
    const info: RoomInfo = { id: 'r', floor: 1, templateId: 'low_wall_cover', mirrorX: false, mirrorY: false, cells: [{ cx: 0, cy: 0 }], doors: [], tags: [], difficulty: 0, expanded: false };
    const l = new RoomLayout(info, emptyState('r'));
    // Template row 2 col 3 is a short wall → global (4,3).
    expect(l.obstacleIdAt(4, 3)).toBe('concrete_wall_short');
    expect(l.blocksProjectile(4, 3, 'straight')).toBe(true);
    expect(l.blocksProjectile(4, 3, 'lobbed')).toBe(false);
    expect(l.blocksMovement(4, 3, 'walk')).toBe(true);
    expect(l.blocksMovement(4, 3, 'fly')).toBe(false);
    expect(l.blocksProjectile(0, 0, 'lobbed')).toBe(true);
    const hole = registry.obstacles.get('missing_floor');
    expect(hole.blocksMovement).toEqual(['walk']);
    expect(hole.blocksProjectiles).toEqual([]);
  });
});

describe('generator', () => {
  /** Expand rooms breadth-first from the lobby, like a player walking outward, `n` times. */
  const explore = (seed: number, floorIndex: number, n: number): FloorState => {
    const { floor } = generateFloor(seed, floorIndex);
    const f = structuredClone(floor);
    const queue = [f.lobbyRoomId];
    const seen = new Set(queue);
    for (let i = 0; i < n && queue.length; i++) {
      const id = queue.shift()!;
      const before = f.rooms[id]!.expanded ? structuredClone(f.rooms[id]!.doors) : null;
      const exp = expandRoom(f, seed, id);
      for (const info of exp?.infos ?? []) {
        // Rooms the player has already been in never change.
        if (floor.rooms[info.id]?.expanded || (before && info.id === id)) expect(info.doors).toEqual(f.rooms[info.id]!.doors);
        f.rooms[info.id] = info;
        for (const c of info.cells) f.cells[`${c.cx},${c.cy}`] = info.id;
      }
      for (const d of f.rooms[id]!.doors) if (!seen.has(d.toRoom)) { seen.add(d.toRoom); queue.push(d.toRoom); }
    }
    return f;
  };

  it('starts a floor as an expanded lobby with its first neighbours, deterministically', () => {
    const a = generateFloor(1234, 1);
    expect(JSON.stringify(generateFloor(1234, 1).floor)).toBe(JSON.stringify(a.floor));
    const lobby = a.floor.rooms[a.floor.lobbyRoomId]!;
    expect(lobby.tags).toContain('lobby');
    expect(lobby.expanded).toBe(true);
    expect(lobby.doors.length).toBeGreaterThanOrEqual(1);
    expect(lobby.doors.length).toBeLessThanOrEqual(2);
    expect(a.rooms.find((r) => r.id === lobby.id)!.furniture.some((f) => f.defId === 'elevator')).toBe(true);
    for (const d of lobby.doors) expect(a.floor.rooms[d.toRoom]!.expanded).toBe(false);
  });

  it('grows without overlaps, keeps doors paired, and never dead-ends', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const f = explore(seed, 1, 300);
      const rooms = Object.values(f.rooms);
      expect(rooms.length).toBeGreaterThan(150);
      const owners = new Map<string, string>();
      for (const r of rooms) for (const c of r.cells) {
        const k = `${c.cx},${c.cy}`;
        expect(owners.has(k)).toBe(false);
        owners.set(k, r.id);
      }
      for (const r of rooms) for (const d of r.doors) {
        const other = f.rooms[d.toRoom]!;
        expect(other.doors.some((o) => o.toRoom === r.id && Math.abs(o.x - d.x) + Math.abs(o.y - d.y) === 1)).toBe(true);
      }
      expect(rooms.some((r) => !r.expanded)).toBe(true);
    }
  });

  it('gets harder with distance and depth, and places boss rooms only where a boss is eligible', () => {
    expect(roomDifficulty(1, [{ cx: 0, cy: 0 }])).toBe(0);
    expect(roomDifficulty(1, [{ cx: 6, cy: 0 }])).toBe(2);
    expect(roomDifficulty(2, [{ cx: 0, cy: 3 }])).toBe(5);
    let bosses = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const f = explore(seed, 1, 400);
      for (const r of Object.values(f.rooms)) {
        if (!r.tags.includes('boss')) continue;
        bosses++;
        expect(r.difficulty).toBeGreaterThanOrEqual(registry.enemies.get('facility_manager').boss!.minDifficulty - 0.5);
        // Its stairs room hangs off it, as a dead end.
        const stairs = r.doors.map((d) => f.rooms[d.toRoom]!).find((x) => x.tags.includes('stairsDown'));
        expect(stairs?.doors).toHaveLength(1);
      }
      expect(stairsDownRooms(f).length).toBe(Object.values(f.rooms).filter((r) => r.tags.includes('boss')).length);
    }
    expect(bosses).toBeGreaterThan(0);
  });

  it('fills spawn slots within the threat budget and the difficulty cap', () => {
    const info = { ...room('pillars'), difficulty: 1 };
    const layout = new RoomLayout(info, initialRoomState(info));
    for (const d of [0, 1, 3, 6]) {
      for (let i = 0; i < 40; i++) {
        const roster = rollRoster(layout, d, new Rng(i));
        const threat = roster.reduce((sum, m) => sum + registry.enemies.get(m.defId).threat, 0);
        expect(threat).toBeLessThanOrEqual(threatBudget(d));
        for (const m of roster) expect(registry.enemies.get(m.defId).threat).toBeLessThanOrEqual(threatCap(d));
      }
    }
    // Tagged slots respect their tags; pinned list slots always spawn their enemy.
    const den = { ...room('intern_pool'), difficulty: 0 };
    const roster = rollRoster(new RoomLayout(den, initialRoomState(den)), 0, new Rng(3));
    expect(roster.filter((m) => m.defId === 'intern')).toHaveLength(4);
  });

  it('furnishes rooms from their slots, fancier farther out', () => {
    const value = (d: number) => {
      let total = 0, n = 0;
      for (let seed = 0; seed < 60; seed++) {
        const info = { ...room('great_hall', [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }, { cx: 1, cy: 1 }]), id: `g${seed}`, difficulty: d };
        for (const f of initialRoomState(info, seed).furniture) {
          const v = registry.furniture.get(f.defId).value;
          if (v && f.uid.includes('-map') && f.defId !== 'space_heater') { total += v; n++; }
        }
      }
      return total / n;
    };
    expect(value(8)).toBeGreaterThan(value(0) + 1);
  });
});

describe('commands', () => {
  it('creates a world and replays identically', () => {
    const cmds = newWorldCommands('p1', 99);
    const a = emptyWorld();
    const touched = applyCommands(a, cmds);
    expect(touched.has('world')).toBe(true);
    expect(touched.has('player:p1')).toBe(true);
    const b = emptyWorld();
    applyCommands(b, JSON.parse(JSON.stringify(cmds)));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.rooms[a.floors[1]!.lobbyRoomId]!.ownerId).toBe('p1');
    // You start at home: the apartment (floor 0) with the home bed and the stash.
    const home = a.rooms[a.floors[0]!.lobbyRoomId]!;
    expect(a.players.p1!.floor).toBe(0);
    expect(a.players.p1!.roomId).toBe(home.id);
    expect(home.ownerId).toBe('p1');
    expect(home.furniture.some((f) => f.defId === 'storage_box')).toBe(true);
    expect(home.furniture.some((f) => f.defId === 'home_bed')).toBe(true);
    expect(getInbox(a, 'p1').messages.map((m) => m.id)).toContain('intro-1');
  });

  it('touches only the affected room on tileSet and wipes wallpaper', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 5));
    const roomId = Object.keys(w.rooms)[1]!;
    applyCommands(w, [{ type: 'surfaceSet', roomId, x: 3, y: 3, layer: 'wall', surface: 'wallpaper_rose' }]);
    const t = applyCommands(w, [{ type: 'tileSet', roomId, x: 3, y: 3, obstacle: null }]);
    expect([...t]).toEqual([`room:${roomId}`]);
    expect(w.rooms[roomId]!.wallSurfaces['3,3']).toBeUndefined();
  });

  it('death wipes the hotbar but keeps cash', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 5));
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { cash: 50 } }]);
    applyCommands(w, [{ type: 'playerDied', playerId: 'p1', respawn: { floor: 1, roomId: 'f1r0', x: 9, y: 5 }, redHalves: 6 }]);
    const p = w.players.p1!;
    expect(p.cash).toBe(50);
    expect(p.hotbar.main).toBeNull();
    expect(p.hotbar.off).toBeNull();
  });
});

it('cell constants match the default 16:9-ish room', () => {
  expect(CELL_W - 2).toBe(17);
  expect(CELL_H - 2).toBe(9);
});

const room = (templateId: string, cells = [{ cx: 0, cy: 0 }]): RoomInfo =>
  ({ id: 'r', floor: 1, templateId, mirrorX: false, mirrorY: false, cells, doors: [], tags: [], difficulty: 0, expanded: false });

describe('wall autotiling', () => {
  const pieces = (L: RoomLayout, x: number, y: number) => wallQuarters(wallMask(L, x, y)).map((q) => `${q.piece}${q.rot}`).join(' ');
  const withWalls = (tiles: [number, number][]) => {
    const st = emptyState('r');
    for (const [x, y] of tiles) st.tileOverrides[`${x},${y}`] = 'concrete_wall';
    return new RoomLayout(room('level1_lobby'), st);
  };

  it('faces room edges inward and notches room corners', () => {
    const L = withWalls([]);
    // Top edge: enclosed above, the lower quarters' faces turned twice to point south, into the room.
    expect(wallQuarters(wallMask(L, 5, 0)).map((q) => q.piece)).toEqual(['fill', 'fill', 'edge', 'edge']);
    expect(wallQuarters(wallMask(L, 5, 0))[2]!.rot).toBe(2);
    // Left edge faces east.
    expect(wallQuarters(wallMask(L, 0, 5)).map((q) => `${q.piece}${q.rot}`)).toEqual(['fill0', 'edge1', 'edge1', 'fill3']);
    // Top-left corner: all joined except the diagonal into the room.
    expect(pieces(L, 0, 0)).toBe('fill0 fill1 inner2 fill3');
  });

  it('handles lone pillars, thick blocks and L-shapes joined to the corner', () => {
    expect(pieces(withWalls([[8, 5]]), 8, 5)).toBe('outer0 outer1 outer2 outer3');
    // A 2×6 block: corners are outer on two sides, the long sides are edges, nothing is left open.
    const block: [number, number][] = [];
    for (let y = 3; y < 9; y++) for (let x = 6; x < 8; x++) block.push([x, y]);
    const B = withWalls(block);
    expect(pieces(B, 6, 3)).toBe('outer0 edge0 fill2 edge3');
    expect(pieces(B, 6, 5)).toBe('edge3 fill1 fill2 edge3');
    // An L from the top-left corner: (1,1),(2,1),(1,2). (1,1) joins the corner walls on all sides
    // but still shows an inner notch toward (2,2); (2,1) is a stub sticking out of the top wall.
    const L = withWalls([[1, 1], [2, 1], [1, 2]]);
    expect(pieces(L, 1, 1)).toBe('fill0 fill1 inner2 fill3');
    expect(pieces(L, 2, 1)).toBe('fill0 edge1 outer2 edge2');
    // The room corner is now fully enclosed.
    expect(wallMask(L, 0, 0) & WallBits.SE).toBeTruthy();
  });

  it('joins walls of different heights into one shape', () => {
    // Kits build a low wall first and raise it later, so mixed runs are common: no seam between heights.
    const st = emptyState('r');
    st.tileOverrides['1,5'] = 'concrete_wall_short';
    st.tileOverrides['2,5'] = 'drywall';
    const L = new RoomLayout(room('level1_lobby'), st);
    expect(wallMask(L, 1, 5) & WallBits.W).toBeTruthy();
    expect(wallMask(L, 0, 5) & WallBits.E).toBeTruthy();
    expect(wallMask(L, 2, 5) & WallBits.W).toBeTruthy();
  });
});

describe('stacks', () => {
  const hotbar = (): Hotbar => ({ main: null, off: null, armor: null, slots: [null, null] });

  it('merges matching tools and rolls up to the cap', () => {
    const hb = hotbar();
    const a = createItem('drywall_kit', 'a', { count: 8 });
    expect(addToHotbar(hb, a)).toBe(true);
    expect(addToHotbar(hb, createItem('drywall_kit', 'b', { count: 16 }))).toBe(true);
    expect(countLeft(hb.main!)).toBe(24);
    expect(hb.slots).toEqual([null, null]);
    hb.main!.data.count = MAX_STACK - 4;
    expect(addToHotbar(hb, createItem('drywall_kit', 'c', { count: 10 }))).toBe(true);
    expect(countLeft(hb.main!)).toBe(MAX_STACK);
    expect(countLeft(hb.slots[0]!)).toBe(6);
  });

  it('keeps the remainder when the hotbar is full', () => {
    const hb = hotbar();
    hb.main = createItem('roll_carpet_teal', 'm', { count: MAX_STACK - 2 });
    hb.slots = [createItem('box_cutter'), createItem('claw_hammer')];
    const it = createItem('roll_carpet_teal', 'x', { count: 5 });
    expect(addToHotbar(hb, it)).toBe(false);
    expect(countLeft(hb.main)).toBe(MAX_STACK);
    expect(countLeft(it)).toBe(3);
  });

  it('starts tools and rolls with whole-unit counts', () => {
    expect(countLeft(createItem('drywall_kit'))).toBe(16);
    expect(countLeft(createItem('roll_wallpaper_rose'))).toBe(32);
    expect(createItem('claw_hammer').data.halves).toBeUndefined();
  });
});

describe('map furniture', () => {
  it('turns template-map braziers into liftable furniture', () => {
    const info = room('stairs_down_room');
    const st = initialRoomState(info);
    const braziers = st.furniture.filter((f) => f.defId === 'space_heater');
    expect(braziers).toHaveLength(4);
    const L = new RoomLayout(info, st);
    expect(L.obstacleIdAt(braziers[0]!.x, braziers[0]!.y)).toBeNull();
    expect(L.furnitureAtTile(braziers[0]!.x, braziers[0]!.y)?.defId).toBe('space_heater');
  });
});

describe('rosters and ownership', () => {
  const world = () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 11));
    return w;
  };
  const withMonsters = (w: WorldState) => Object.values(w.rooms).find((r) => r.monsters.length >= 2)!;

  it('generated rooms start with their template roster, and the safe room is owned by the world owner', () => {
    const w = world();
    const safe = w.rooms[w.floors[1]!.lobbyRoomId]!;
    expect(safe.ownerId).toBe('p1');
    // Owned, but not secure until its doors are barricaded.
    expect(isSecure(w, safe.id)).toBe(false);
    const r = withMonsters(w);
    expect(r.ownerId).toBeNull();
    expect(r.monsters.every((m) => m.id === `s:${m.spawnId}`)).toBe(true);
  });

  it('kills monsters by id and records who owns a room', () => {
    const w = world();
    const r = withMonsters(w);
    const [a, b] = r.monsters;
    applyCommands(w, [{ type: 'monsterKilled', roomId: r.id, monsterId: a!.id }]);
    applyCommands(w, [{ type: 'monsterKilled', roomId: r.id, monsterId: b!.id }]);
    expect(w.rooms[r.id]!.monsters.map((m) => m.id)).not.toContain(a!.id);
    expect(w.rooms[r.id]!.monsters.map((m) => m.id)).not.toContain(b!.id);
    applyCommands(w, [{ type: 'roomOwned', roomId: r.id, ownerId: 'p1' }]);
    expect(w.rooms[r.id]!.ownerId).toBe('p1');
    applyCommands(w, [{ type: 'roomOwnerCleared', roomId: r.id }]);
    expect(w.rooms[r.id]!.ownerId).toBeNull();
  });

});

describe('clock', () => {
  it('starts day 1 at 6 AM and advances by transitions', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 3));
    expect(getClock(w)).toEqual({ day: 1, minute: 360 });
    applyCommands(w, [{ type: 'timePassed', minutes: 15 }, { type: 'timePassed', minutes: 15 }]);
    expect(formatTime(getClock(w).minute)).toBe('6:30 AM');
    expect(formatTime(1530)).toBe('1:30 AM');
  });

  it('wakes 8 hours later but never before 6 AM', () => {
    expect(wakeTime({ day: 1, minute: 20 * 60 })).toEqual({ day: 2, minute: 360 });
    expect(wakeTime({ day: 1, minute: 22 * 60 })).toEqual({ day: 2, minute: 360 });
    expect(wakeTime({ day: 3, minute: 26 * 60 })).toEqual({ day: 4, minute: 600 });
    expect(wakeTime({ day: 1, minute: 9 * 60 })).toEqual({ day: 2, minute: 360 });
  });

  it('slept sets the clock and health together', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 3));
    const t = applyCommands(w, [{ type: 'slept', playerId: 'p1', clock: { day: 2, minute: 360 }, redHalves: 4 }]);
    expect(t.has('global:clock')).toBe(true);
    expect(w.players.p1!.redHalves).toBe(4);
    expect(getClock(w)).toEqual({ day: 2, minute: 360 });
  });

  it('fires tick resolvers every 15 minutes and daily ones on sleep, deterministically', () => {
    const run = () => {
      const w = emptyWorld();
      applyCommands(w, newWorldCommands('p1', 77));
      const log: Command[] = [];
      const dispatch = (c: Command) => { applyCommand(w, c); log.push(c); };
      // Sleeping at 8:30 AM wakes at 6 AM the next day (21.5 h later).
      advanceClock(w, { day: 1, minute: 360 }, { day: 1, minute: 510 }, dispatch);
      advanceClock(w, { day: 1, minute: 510 }, wakeTime({ day: 1, minute: 510 }), dispatch, 1);
      return log;
    };
    registerTick('test', (_s, ctx) => [{ type: 'globalSet', key: `h${ctx.tick}`, value: Math.floor(ctx.rng.next() * 1000) }]);
    registerDaily('test-day', (_s, ctx) => [{ type: 'globalSet', key: `d${ctx.day}`, value: true }]);
    try {
      const a = run();
      const hours = a.filter((c) => c.type === 'globalSet' && c.key.startsWith('h')).map((c) => (c as { key: string }).key);
      // 6:00 -> 8:30 is ten 15-minute ticks (6:15 … 8:30); the night until 6 AM is 86 more.
      expect(hours.slice(0, 2)).toEqual(['h25', 'h26']);
      expect(hours).toHaveLength(10 + 86);
      expect(a[a.length - 1]).toMatchObject({ key: 'd1' });
      expect(JSON.stringify(run())).toBe(JSON.stringify(a));
    } finally {
      unregisterResolver('test');
      unregisterResolver('test-day');
    }
  });

  it('keeps the whole message history with an unread count', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 3));
    const intro = getInbox(w, 'p1').messages.length;
    for (let i = 0; i < 60; i++) {
      applyCommands(w, [{ type: 'messagePosted', playerId: 'p1', message: { id: `m${i}`, day: 1, minute: 360, severity: 'info', text: `${i}` } }]);
    }
    expect(getInbox(w, 'p1').messages).toHaveLength(intro + 60);
    expect(getInbox(w, 'p1').messages.find((m) => m.id.startsWith('m'))!.id).toBe('m0');
    expect(getInbox(w, 'p1').unread).toBe(intro + 60);
    applyCommands(w, [{ type: 'messagesRead', playerId: 'p1' }]);
    expect(getInbox(w, 'p1').unread).toBe(0);
  });
});

describe('home and tools', () => {
  it('the apartment bed is fixed furniture', () => {
    expect(registry.furniture.get('home_bed').fixed).toBe(true);
    expect(registry.furniture.get('bed').fixed).toBeUndefined();
  });

  it('dual-use tools start with renovation uses; plain weapons have none', () => {
    expect(createItem('crowbar').data.count).toBe(6);
    expect(createItem('box_cutter').data.count).toBeUndefined();
  });
});

describe('infinite floors', () => {
  it('roomsGenerated adds rooms and touches only their regions and new room docs', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 8));
    const floor = w.floors[1]!;
    const next = floor.rooms[floor.lobbyRoomId]!.doors[0]!.toRoom;
    const exp = expandRoom(floor, w.seed, next)!;
    const keys = applyCommands(w, [{ type: 'roomsGenerated', floor: 1, infos: exp.infos, states: exp.states }]);
    expect(w.floors[1]!.rooms[next]!.expanded).toBe(true);
    for (const st of exp.states) expect(keys.has(`room:${st.id}`)).toBe(true);
    for (const info of exp.infos) expect(keys.has(regionKeyOf(1, info))).toBe(true);
    expect(keys.has('floor:1')).toBe(false);
    expect(expandRoom(w.floors[1]!, w.seed, next)).toBeNull();
  });

});

describe('surfaces', () => {
  it('Backrooms rooms default to yellow wallpaper and damp carpet; templates and tiles override', () => {
    const info = { ...room('pillars'), floor: 1 };
    const L = new RoomLayout(info, initialRoomState(info));
    expect(L.floorSurfaceAt(5, 5)).toBe('carpet_damp');
    expect(L.wallSurfaceAt(0, 0)).toBe('wallpaper_yellow');
    expect(L.wallSurfaceAt(5, 5)).toBeUndefined();
    L.state.wallSurfaces['0,0'] = 'wallpaper_rose';
    expect(L.wallSurfaceAt(0, 0)).toBe('wallpaper_rose');
    const apt = { ...room('apartment'), floor: 0 };
    const A = new RoomLayout(apt, initialRoomState(apt));
    expect(A.floorSurfaceAt(5, 5)).toBe('wood_oak');
    expect(A.wallSurfaceAt(0, 0)).toBe('wallpaper_sage');
    // Defaults aren't stored per tile, so saves don't grow.
    expect(Object.keys(A.state.floorSurfaces)).toHaveLength(0);
  });
});

describe('saves', () => {
  it('upgrades current saves and refuses ones too old to upgrade', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 30));
    expect(migrate(JSON.parse(JSON.stringify(w))).schemaVersion).toBe(SCHEMA_VERSION);
    expect(() => migrate({ ...JSON.parse(JSON.stringify(w)), schemaVersion: 6 })).toThrow(SaveTooOldError);
  });
});

describe('securing', () => {
  /** A world with the player standing in a cleared room next to the lobby. */
  const setup = (seed = 41) => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', seed));
    const floor = w.floors[1]!;
    const lobby = floor.rooms[floor.lobbyRoomId]!;
    const id = lobby.doors[0]!.toRoom;
    const exp = expandRoom(floor, w.seed, id)!;
    applyCommands(w, [{ type: 'roomsGenerated', floor: 1, infos: exp.infos, states: exp.states }]);
    const room = w.rooms[id]!;
    room.visited = true;
    room.monsters = [];
    return { w, info: w.floors[1]!.rooms[id]!, room, lobby };
  };
  const barricadeAll = (w: WorldState, info: RoomInfo, tier: number) => {
    for (const d of info.doors) {
      applyCommands(w, [{ type: 'barricadeSet', roomId: info.id, door: `${d.x},${d.y}`, barricade: { tier, hp: BARRICADE_TIERS[tier]!.hp } }]);
    }
  };

  it('requires stronger barricades next to harder rooms', () => {
    expect(requiredTier(0)).toBe(1);
    expect(requiredTier(2.9)).toBe(1);
    expect(requiredTier(3)).toBe(2);
    expect(requiredTier(50)).toBe(4);
  });

  it('an owned room is secure once every door into a room with monsters has a strong-enough barricade', () => {
    const { w, info } = setup();
    applyCommands(w, [{ type: 'roomOwned', roomId: info.id, ownerId: 'p1' }]);
    const risky = info.doors.filter((d) => w.rooms[d.toRoom]!.monsters.length > 0);
    expect(risky.length).toBeGreaterThan(0);
    expect(isSecure(w, info.id)).toBe(false);
    // Doors into cleared or owned rooms need nothing.
    for (const d of risky) applyCommands(w, [{ type: 'barricadeSet', roomId: info.id, door: `${d.x},${d.y}`, barricade: { tier: 4, hp: 300 } }]);
    expect(isSecure(w, info.id)).toBe(true);
    // A barricade too weak for a hard neighbour doesn't count.
    const d = risky[0]!;
    w.floors[1]!.rooms[d.toRoom]!.difficulty = 9;
    applyCommands(w, [{ type: 'barricadeSet', roomId: info.id, door: `${d.x},${d.y}`, barricade: { tier: 1, hp: 20 } }]);
    expect(isSecure(w, info.id)).toBe(false);
  });

  it('losing a room takes its company flag down', () => {
    const { w, lobby } = setup();
    applyCommands(w, [{ type: 'furniturePlaced', roomId: lobby.id, placement: { uid: 'flag', defId: 'company_flag', x: 5, y: 5, rot: 0 } }]);
    applyCommands(w, securingDay(w, { day: 1, rng: new Rng(1) }));
    applyCommands(w, securingDay(w, { day: 2, rng: new Rng(2) }));
    expect(w.rooms[lobby.id]!.ownerId).toBeNull();
    expect(w.rooms[lobby.id]!.furniture.some((f) => f.uid === 'flag')).toBe(false);
  });

  it('owned rooms are secure only when barricaded and empty; home always is', () => {
    const { w, lobby } = setup();
    expect(isSecure(w, lobby.id)).toBe(false);
    barricadeAll(w, lobby, 4);
    expect(isSecure(w, lobby.id)).toBe(true);
    applyCommands(w, [{ type: 'monsterAdded', roomId: lobby.id, record: { id: 'x', defId: 'rat' } }]);
    expect(isSecure(w, lobby.id)).toBe(false);
    expect(isSecure(w, w.floors[0]!.lobbyRoomId)).toBe(true);
  });

  it('unbarricaded doors from uncleared rooms spill monsters into visited rooms, up to capacity', () => {
    const { w, info, room } = setup();
    const clock = { day: 1, minute: 420 };
    for (let h = 0; h < 800; h++) applyCommands(w, securingTick(w, { clock, rng: new Rng(h) }));
    const threat = room.monsters.reduce((s, m) => s + registry.enemies.get(m.defId).threat, 0);
    expect(room.monsters.length).toBeGreaterThan(0);
    expect(threat).toBeLessThanOrEqual(threatBudget(info.difficulty));
    for (const m of room.monsters) expect(info.doors.map((d) => `${d.x},${d.y}`)).toContain(m.door);
    // Nothing spilled from the lobby side (owned and calm) — monsters only came from unowned neighbours.
    const lobbyDoor = info.doors.find((d) => w.rooms[d.toRoom]!.ownerId);
    if (lobbyDoor) expect(room.monsters.some((m) => m.door === `${lobbyDoor.x},${lobbyDoor.y}`)).toBe(false);
    for (const r of Object.values(w.rooms)) if (!r.visited && r.id !== info.id) expect(r.monsters.every((m) => !m.door)).toBe(true);
  });

  it('barricades wear down facing a source and break into a breach that starts the deadline', () => {
    const { w, info, lobby } = setup();
    // Make the lobby the defended property: barricade it with planks facing the cleared room, which is full of monsters.
    barricadeAll(w, lobby, 1);
    w.rooms[lobby.id]!.visited = true;
    w.rooms[info.id]!.monsters = [{ id: 'r1', defId: 'rat' }];
    const door = lobby.doors.find((d) => d.toRoom === info.id)!;
    const key = `${door.x},${door.y}`;
    const ticks = Math.ceil(BARRICADE_TIERS[1]!.hp / pressurePerTick(info.difficulty));
    for (let h = 0; h < ticks - 1; h++) applyCommands(w, securingTick(w, { clock: { day: 3, minute: 600 }, rng: new Rng(h) }));
    expect(w.rooms[lobby.id]!.barricades[key]!.hp).toBeGreaterThan(0);
    expect(w.rooms[lobby.id]!.barricades[key]!.hp).toBeLessThan(BARRICADE_TIERS[1]!.hp);
    applyCommands(w, securingTick(w, { clock: { day: 3, minute: 600 }, rng: new Rng(99) }));
    expect(w.rooms[lobby.id]!.barricades[key]).toBeUndefined();
    expect(w.rooms[lobby.id]!.monsters.some((m) => m.door === key)).toBe(true);
    expect(w.rooms[lobby.id]!.insecureSince).toBe(3);
    expect(getInbox(w, 'p1').messages.some((m) => m.severity === 'urgent' && m.text.startsWith('Breach'))).toBe(true);
  });

  it('loses an insecure room at the end of the day after, not the same day', () => {
    const { w, lobby } = setup();
    applyCommands(w, securingDay(w, { day: 1, rng: new Rng(1) }));
    expect(w.rooms[lobby.id]!.insecureSince).toBe(1);
    expect(w.rooms[lobby.id]!.ownerId).toBe('p1');
    applyCommands(w, securingDay(w, { day: 2, rng: new Rng(2) }));
    expect(w.rooms[lobby.id]!.ownerId).toBeNull();
    expect(getInbox(w, 'p1').messages.some((m) => m.text.startsWith('You lost'))).toBe(true);
    // Secured in time: the deadline clears instead.
    const s2 = setup(42);
    applyCommands(s2.w, securingDay(s2.w, { day: 1, rng: new Rng(1) }));
    barricadeAll(s2.w, s2.lobby, 4);
    applyCommands(s2.w, securingDay(s2.w, { day: 2, rng: new Rng(2) }));
    expect(s2.w.rooms[s2.lobby.id]!.ownerId).toBe('p1');
    expect(s2.w.rooms[s2.lobby.id]!.insecureSince).toBeUndefined();
  });
});

describe('doorways', () => {
  const world = () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 61));
    const floor = w.floors[1]!;
    const lobby = floor.rooms[floor.lobbyRoomId]!;
    return { w, lobby, door: lobby.doors[0]! };
  };

  it('a barricade sits on both sides of its doorway, with one HP', () => {
    const { w, lobby, door } = world();
    const key = `${door.x},${door.y}`;
    const p = partnerDoor(w, lobby.id, key)!;
    expect(p.roomId).toBe(door.toRoom);
    applyCommands(w, [{ type: 'barricadeSet', roomId: lobby.id, door: key, barricade: { tier: 2, hp: 80 } }]);
    expect(w.rooms[door.toRoom]!.barricades[p.key]).toEqual({ tier: 2, hp: 80 });
    applyCommands(w, [{ type: 'barricadesDamaged', roomId: door.toRoom, hp: { [p.key]: 50 } }]);
    expect(w.rooms[lobby.id]!.barricades[key]!.hp).toBe(50);
    applyCommands(w, [{ type: 'barricadeSet', roomId: door.toRoom, door: p.key, barricade: null }]);
    expect(w.rooms[lobby.id]!.barricades[key]).toBeUndefined();
  });

  it('wears a doorway once per tick even with monsters on both sides', () => {
    const { w, lobby, door } = world();
    const key = `${door.x},${door.y}`;
    w.rooms[lobby.id]!.visited = w.rooms[door.toRoom]!.visited = true;
    w.rooms[lobby.id]!.monsters = [{ id: 'a', defId: 'rat' }];
    w.rooms[door.toRoom]!.monsters = [{ id: 'b', defId: 'rat' }];
    applyCommands(w, [{ type: 'barricadeSet', roomId: lobby.id, door: key, barricade: { tier: 4, hp: 300 } }]);
    applyCommands(w, securingTick(w, { clock: { day: 1, minute: 400 }, rng: new Rng(1) }));
    const lost = 300 - w.rooms[lobby.id]!.barricades[key]!.hp;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(Math.max(pressurePerTick(w.floors[1]!.rooms[door.toRoom]!.difficulty), pressurePerTick(lobby.difficulty)) + 1e-9);
  });

  it('a cleared room surrounded by cleared rooms stays empty', () => {
    const { w, lobby, door } = world();
    const room = w.rooms[door.toRoom]!;
    room.visited = true;
    room.monsters = [];
    for (const d of w.floors[1]!.rooms[room.id]!.doors) w.rooms[d.toRoom]!.monsters = [];
    for (let h = 0; h < 400; h++) applyCommands(w, securingTick(w, { clock: { day: 1, minute: 400 }, rng: new Rng(h) }));
    expect(room.monsters).toHaveLength(0);
    expect(lobby).toBeDefined();
  });

  it('a transition leaves both of its rooms out of monster movement', () => {
    const { w, lobby, door } = world();
    const cleared = w.rooms[lobby.id]!, busy = w.rooms[door.toRoom]!;
    cleared.visited = busy.visited = true;
    cleared.monsters = [];
    busy.monsters = [{ id: 'a', defId: 'rat' }];
    const quiet = new Set([lobby.id, door.toRoom]);
    for (let h = 0; h < 200; h++) applyCommands(w, securingTick(w, { clock: { day: 1, minute: 400 }, rng: new Rng(h), quiet }));
    expect(cleared.monsters).toHaveLength(0);
    // Without the transition, the uncleared room spills into the cleared one.
    for (let h = 0; h < 200 && !cleared.monsters.length; h++) applyCommands(w, securingTick(w, { clock: { day: 1, minute: 400 }, rng: new Rng(h) }));
    expect(cleared.monsters.length).toBeGreaterThan(0);
  });

  it('pried-off barricades only stack with ones worn the same', () => {
    const fresh = makeItem('plank_barricade');
    const worn = makeItem('plank_barricade', 'w', { count: 1, hp: 7 });
    expect(canStack(fresh, makeItem('plank_barricade'))).toBe(true);
    expect(canStack(fresh, worn)).toBe(false);
    expect(canStack(worn, makeItem('plank_barricade', 'v', { count: 1, hp: 7 }))).toBe(true);
  });
});

describe('hardware store', () => {
  it('takes cash now and delivers to the apartment when the day ends', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 50));
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { cash: 30 } }]);
    expect(storeCatalog().some((d) => d.id === 'plank_barricade')).toBe(true);
    applyCommands(w, [{ type: 'orderPlaced', playerId: 'p1', items: ['plank_barricade'], cost: 5 }]);
    expect(w.players.p1!.cash).toBe(25);
    expect(() => applyCommands(w, [{ type: 'orderPlaced', playerId: 'p1', items: ['blast_door'], cost: 150 }])).toThrow();
    const apt = w.rooms[w.floors[0]!.lobbyRoomId]!;
    const before = apt.groundItems.length;
    applyCommands(w, deliverOrders(w, { day: 1, rng: new Rng(1) }));
    expect(apt.groundItems.length).toBe(before + 1);
    expect(apt.groundItems.at(-1)!.item.defId).toBe('plank_barricade');
    expect(getOrders(w, 'p1').items).toEqual([]);
  });

  it('sets ordered furniture down in the apartment, off the player, and keeps what does not fit', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 51));
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { cash: 10000 } }]);
    expect(furnitureCatalog().some((d) => d.id === 'bed')).toBe(true);
    const order = Array.from({ length: 40 }, () => furnitureOrder('bed'));
    applyCommands(w, [{ type: 'orderPlaced', playerId: 'p1', items: order, cost: 800 }]);
    const aptInfo = w.floors[0]!.rooms[w.floors[0]!.lobbyRoomId]!;
    const apt = w.rooms[aptInfo.id]!;
    const before = apt.furniture.length;
    applyCommands(w, deliverOrders(w, { day: 1, rng: new Rng(1) }));
    const beds = apt.furniture.length - before;
    expect(beds).toBeGreaterThan(0);
    // The apartment can't hold 40 beds: the rest stay on order.
    expect(getOrders(w, 'p1').items.length).toBe(40 - beds);
    // Every bed sits on legal, distinct tiles, and none on the player.
    const L = new RoomLayout(aptInfo, apt);
    const p = w.players.p1!;
    expect(L.furnitureAtTile(Math.floor(p.x), Math.floor(p.y))).toBeUndefined();
  });
});

describe('estate areas', () => {
  /** Lobby plus the first neighbour, both owned by p1, joined by a door. */
  const estate = () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 71));
    const floor = w.floors[1]!;
    const lobby = floor.rooms[floor.lobbyRoomId]!;
    const nId = lobby.doors[0]!.toRoom;
    applyCommands(w, [{ type: 'roomOwned', roomId: nId, ownerId: 'p1' }]);
    return { w, lobby, n: floor.rooms[nId]! };
  };

  it('an estate is every same-owner room connected by doors; unowned rooms without openings are on their own', () => {
    const { w, lobby, n } = estate();
    expect(areaRooms(w, lobby.id).sort()).toEqual([lobby.id, n.id].sort());
    const other = lobby.doors.find((d) => d.toRoom !== n.id)?.toRoom ?? n.doors.find((d) => d.toRoom !== lobby.id)!.toRoom;
    expect(areaRooms(w, other)).toEqual([other]);
  });

  it('an area layout answers tile queries from the right room', () => {
    const { w, lobby, n } = estate();
    const area = new AreaLayout(w, 1, [lobby.id, n.id]);
    const c = n.cells[0]!;
    const x = c.cx * CELL_W + 5, y = c.cy * CELL_H + 5;
    expect(area.roomAt(x, y)?.info.id).toBe(n.id);
    expect(area.roomAt(lobby.cells[0]!.cx * CELL_W + 5, lobby.cells[0]!.cy * CELL_H + 5)?.info.id).toBe(lobby.id);
    expect(area.kindAt(x, y)).toBe(new RoomLayout(n, w.rooms[n.id]!).kindAt(x, y));
    expect(area.kindAt(9999, 9999)).toBe('void');
    area.setActive([n.id]);
    expect(area.originX).toBe(Math.min(...n.cells.map((k) => k.cx)) * CELL_W);
  });

  it('knocking through a structural wall between two owned rooms makes an opening that links them', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 72));
    const floor = w.floors[1]!;
    // Find two adjacent rooms sharing a straight wall line, own both, and pick a mid-wall tile.
    let found: { a: RoomInfo; x: number; y: number; t: { x: number; y: number; roomId: string } } | null = null;
    for (const a of Object.values(floor.rooms)) {
      for (const b of Object.values(floor.rooms)) {
        if (a === b) continue;
        applyCommands(w, [{ type: 'roomOwned', roomId: a.id, ownerId: 'p1' }, { type: 'roomOwned', roomId: b.id, ownerId: 'p1' }]);
      }
    }
    outer: for (const a of Object.values(floor.rooms)) {
      const L = new RoomLayout(a, w.rooms[a.id]!);
      for (const tile of L.tiles()) {
        if (!L.isBoundary(tile.x, tile.y)) continue;
        const t = structuralWallTarget(w, a, tile.x, tile.y);
        if (t) { found = { a, x: tile.x, y: tile.y, t }; break outer; }
      }
    }
    expect(found).not.toBeNull();
    const { a, x, y, t } = found!;
    applyCommands(w, [{ type: 'tileSet', roomId: a.id, x, y, obstacle: null }, { type: 'tileSet', roomId: t.roomId, x: t.x, y: t.y, obstacle: null }]);
    expect(openings(w, a).some((o) => o.toRoom === t.roomId)).toBe(true);
    expect(areaRooms(w, a.id)).toContain(t.roomId);
    // The opening is a door to securing: with monsters behind it, it can't be adequate.
    w.rooms[t.roomId]!.monsters = [{ id: 'z', defId: 'rat' }];
    const st = doorStatuses(w, a).find((d) => d.neighbor.id === t.roomId && d.door.x === x && d.door.y === y);
    expect(st?.source).toBe(true);
    expect(st?.adequate).toBe(false);
  });

  it('rooms joined by a knocked-through wall are one area whoever owns them', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 73));
    const floor = w.floors[1]!;
    let found: { a: RoomInfo; x: number; y: number; t: { x: number; y: number; roomId: string } } | null = null;
    outer: for (const a of Object.values(floor.rooms)) {
      const L = new RoomLayout(a, w.rooms[a.id]!);
      for (const tile of L.tiles()) {
        if (!L.isBoundary(tile.x, tile.y)) continue;
        const t = structuralWallTarget(w, a, tile.x, tile.y);
        if (t) { found = { a, x: tile.x, y: tile.y, t }; break outer; }
      }
    }
    expect(found).not.toBeNull();
    const { a, x, y, t } = found!;
    // Neither room is anyone's.
    w.rooms[a.id]!.ownerId = null;
    w.rooms[t.roomId]!.ownerId = null;
    expect(areaRooms(w, a.id)).toEqual([a.id]);
    applyCommands(w, [{ type: 'tileSet', roomId: a.id, x, y, obstacle: null }, { type: 'tileSet', roomId: t.roomId, x: t.x, y: t.y, obstacle: null }]);
    expect(areaRooms(w, a.id).sort()).toEqual([a.id, t.roomId].sort());
    expect(areaRooms(w, t.roomId).sort()).toEqual([a.id, t.roomId].sort());
  });

  it('a monster walking into another room moves to its roster', () => {
    const { w, lobby, n } = estate();
    w.rooms[lobby.id]!.monsters = [{ id: 'm1', defId: 'rat', spawnId: '1,1' }];
    applyCommands(w, [{ type: 'monsterMoved', from: lobby.id, to: n.id, monsterId: 'm1' }]);
    expect(w.rooms[lobby.id]!.monsters).toHaveLength(0);
    expect(w.rooms[n.id]!.monsters.find((m) => m.id === 'm1')).toEqual({ id: 'm1', defId: 'rat' });
  });
});

describe('units and tenants', () => {
  /** Lobby + its first neighbour owned, a bed and a sign in the neighbour. */
  const setup = (seed = 81) => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', seed));
    const floor = w.floors[1]!;
    const lobby = floor.rooms[floor.lobbyRoomId]!;
    const n = floor.rooms[lobby.doors[0]!.toRoom]!;
    w.rooms[n.id]!.monsters = [];
    w.rooms[n.id]!.visited = true;
    applyCommands(w, [{ type: 'roomOwned', roomId: n.id, ownerId: 'p1' }]);
    const L = new RoomLayout(n, w.rooms[n.id]!);
    const spot = L.nearestOpenFloor(n.cells[0]!.cx * CELL_W + 9, n.cells[0]!.cy * CELL_H + 5)!;
    applyCommands(w, [
      { type: 'furniturePlaced', roomId: n.id, placement: { uid: 'sign', defId: 'for_rent_sign', x: spot.x, y: spot.y, rot: 0 } },
    ]);
    const L2 = new RoomLayout(n, w.rooms[n.id]!);
    const bed = L2.findFurnitureSpot(registry.furniture.get('bed'), spot.x + 3, spot.y)!;
    applyCommands(w, [{ type: 'furniturePlaced', roomId: n.id, placement: { uid: 'bed', defId: 'bed', x: bed.x, y: bed.y, rot: 0 } }]);
    // Make every door of the pair secure so the unit counts as safe and connected.
    for (const id of [lobby.id, n.id]) {
      for (const d of floor.rooms[id]!.doors) {
        if (w.rooms[d.toRoom]?.ownerId) continue;
        applyCommands(w, [{ type: 'barricadeSet', roomId: id, door: `${d.x},${d.y}`, barricade: { tier: 4, hp: 300 } }]);
      }
    }
    return { w, lobby, n, spot };
  };

  it('a unit is connected owned floor bounded by walls and doorways', () => {
    const { w, n, spot } = setup();
    const u = unitAt(w, 1, spot.x, spot.y)!;
    expect(u.rooms).toEqual([n.id]);
    expect(u.furniture.map((f) => f.f.uid)).toEqual(expect.arrayContaining(['bed', 'sign']));
    // Door tiles aren't part of it.
    for (const d of n.doors) expect(u.tiles.has(`${d.x},${d.y}`)).toBe(false);
    expect(unitAt(w, 1, 9999, 9999)).toBeNull();
  });

  it('values a unit from preferences, capped by tier, and needs a bed', () => {
    const { w, spot } = setup();
    const s = unitStats(w, unitAt(w, 1, spot.x, spot.y)!);
    expect(s.beds).toBe(1);
    expect(s.secure).toBe(true);
    expect(s.connected).toBe(true);
    const t = makeApplicant(new Rng(5), 't1', 'sign', 1, 1);
    expect(t.prefs.some((p) => p.kind === 'quiet')).toBe(true);
    const v = valuation(t, s);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(TIER_RENT[1]![1]);
    expect(valuation(t, { ...s, beds: 0 })).toBe(0);
    expect(haggle(6, 5).result).toBe('accept');
    expect(haggle(6, 7).result).toBe('counter');
    expect(haggle(6, 12).result).toBe('refuse');
  });

  it('draws applicants less often next to unsecured or uncleared rooms', () => {
    const base = { area: 50, beds: 1, tags: {}, floors: {}, secure: true, quiet: true, connected: true, borderUnsecured: 0, borderUncleared: 0, power: false, water: false };
    expect(applicantChance(base)).toBeCloseTo(0.5);
    expect(applicantChance({ ...base, borderUnsecured: 2 })).toBeLessThan(0.5);
    expect(applicantChance({ ...base, borderUnsecured: 2, borderUncleared: 2 })).toBeLessThan(applicantChance({ ...base, borderUnsecured: 2 }));
  });

  it('the day brings applicants to listings, and rent from tenants', () => {
    const { w } = setup();
    let applicant: Tenant | undefined;
    for (let d = 1; d < 20 && !applicant; d++) {
      applyCommands(w, tenantsDay(w, { day: d, rng: new Rng(d) }));
      applicant = Object.values(getTenants(w)).find((t) => t.status === 'applicant');
    }
    expect(applicant).toBeDefined();
    applyCommands(w, [{ type: 'tenantSet', tenant: { ...applicant!, status: 'living', rent: 3, mood: 60 } }]);
    const cash = w.players.p1!.cash;
    applyCommands(w, tenantsDay(w, { day: 30, rng: new Rng(30) }));
    expect(w.players.p1!.cash).toBe(cash + 3);
    expect(getInbox(w, 'p1').messages.some((m) => m.text.startsWith('Rent: +$3'))).toBe(true);
  });

  it('a tenant trapped with monsters dies at the end of the day unless rescued', () => {
    const { w, n } = setup();
    const t: Tenant = { ...makeApplicant(new Rng(9), 't9', 'sign', 1, 1), status: 'living', rent: 4, mood: 70 };
    applyCommands(w, [{ type: 'tenantSet', tenant: t }]);
    // Shelter next door is the lobby (owned, secure): with monsters in the unit they flee rather than get trapped.
    w.rooms[n.id]!.monsters = [{ id: 'z', defId: 'rat' }];
    applyCommands(w, tenantsTick(w, { clock: { day: 2, minute: 600 }, rng: new Rng(1) }));
    expect(getTenants(w).t9!.displaced).toBe(true);
    // Without a safe room next door, they're trapped, and die at the day's end.
    applyCommands(w, [{ type: 'tenantSet', tenant: { ...getTenants(w).t9!, displaced: false } }]);
    applyCommands(w, [{ type: 'roomOwnerCleared', roomId: w.floors[1]!.lobbyRoomId }]);
    applyCommands(w, tenantsTick(w, { clock: { day: 2, minute: 615 }, rng: new Rng(2) }));
    expect(getTenants(w).t9!.trapped).toBe(2);
    applyCommands(w, tenantsDay(w, { day: 2, rng: new Rng(3) }));
    expect(getTenants(w).t9).toBeUndefined();
  });

  it('the landlord takes weekly rent, then piles up debt, then repossesses stash items', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 82));
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { cash: 100 } }]);
    expect(landlordDay(w, { day: 6, rng: new Rng(1) })).toEqual([]);
    applyCommands(w, landlordDay(w, { day: 7, rng: new Rng(1) }));
    expect(w.players.p1!.cash).toBe(100 - LANDLORD_START.rent);
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { cash: 0 } }]);
    applyCommands(w, landlordDay(w, { day: 14, rng: new Rng(2) }));
    applyCommands(w, landlordDay(w, { day: 21, rng: new Rng(3) }));
    expect((w.globals[LANDLORD_KEY] as { notices: number }).notices).toBe(2);
    const box = () => w.rooms[w.floors[0]!.lobbyRoomId]!.furniture.find((f) => f.defId === 'storage_box')!.contents!.filter(Boolean).length;
    const before = box();
    applyCommands(w, landlordDay(w, { day: 28, rng: new Rng(4) }));
    expect(box()).toBe(before - 3);
    expect((w.globals[LANDLORD_KEY] as { debt: number }).debt).toBe(0);
  });
});

describe('utilities', () => {
  /** Level 1: the lobby (yours) with its generator; returns a run of wire from the generator along open floor. */
  const setup = () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 81));
    const floor = w.floors[1]!;
    const lobby = floor.rooms[floor.lobbyRoomId]!;
    const st = w.rooms[lobby.id]!;
    const gen = st.furniture.find((f) => f.defId === 'generator')!;
    const water = st.furniture.find((f) => f.defId === 'water_main');
    return { w, lobby, st, gen, water };
  };

  it('every Backrooms lobby has a generator and a water main', () => {
    const { gen, water } = setup();
    expect(gen).toBeDefined();
    expect(water).toBeDefined();
  });

  it('a run touching a source is live, and a fault cuts everything past it', () => {
    const { w, lobby, gen } = setup();
    // A straight run of 6 tiles starting under the generator's right end, going down.
    const x = gen.x + 1, y0 = gen.y + 1;
    const run = Array.from({ length: 6 }, (_, i) => ({ x, y: y0 + i }));
    applyCommands(w, run.map((t) => ({ type: 'utilityLaid' as const, roomId: lobby.id, x: t.x, y: t.y, kind: 'power' as const })));
    let nets = utilityNets(w, 1);
    expect(run.every((t) => nets.power.served.has(`${t.x},${t.y}`))).toBe(true);
    expect(nets.water.served.size).toBe(0);
    // A lamp next to the end of the run (in your lobby) is supplied; one far away isn't.
    const lamp = { uid: 'L1', defId: 'floor_lamp', x: x + 1, y: y0 + 5, rot: 0 };
    const far = { uid: 'L2', defId: 'floor_lamp', x: x + 6, y: y0 + 5, rot: 0 };
    expect(fixtureSupplied(w, nets, lobby.id, lamp)).toBe(true);
    expect(fixtureSupplied(w, nets, lobby.id, far)).toBe(false);
    // Break the 3rd segment: the part beyond it (and the lamp) goes dead.
    applyCommands(w, [{ type: 'utilityFault', roomId: lobby.id, x, y: y0 + 2, kind: 'power', fault: true }]);
    nets = utilityNets(w, 1);
    expect(nets.power.served.has(`${x},${y0 + 1}`)).toBe(true);
    expect(nets.power.served.has(`${x},${y0 + 4}`)).toBe(false);
    expect(fixtureSupplied(w, nets, lobby.id, lamp)).toBe(false);
    // Repair it.
    applyCommands(w, [{ type: 'utilityFault', roomId: lobby.id, x, y: y0 + 2, kind: 'power', fault: false }]);
    expect(fixtureSupplied(w, utilityNets(w, 1), lobby.id, lamp)).toBe(true);
    // Taking a segment up removes it.
    applyCommands(w, [{ type: 'utilityRemoved', roomId: lobby.id, x, y: y0 + 2, kind: 'power' }]);
    expect(utilityNets(w, 1).power.segments.has(`${x},${y0 + 2}`)).toBe(false);
  });

  it('rooms nobody owns and the apartment never need wiring', () => {
    const { w, lobby } = setup();
    const nets = utilityNets(w, 1);
    const other = lobby.doors[0]!.toRoom;
    const lamp = { uid: 'L3', defId: 'floor_lamp', x: 0, y: 0, rot: 0 };
    expect(w.rooms[other]!.ownerId).toBeFalsy();
    expect(fixtureSupplied(w, nets, other, lamp)).toBe(true);
    expect(fixtureSupplied(w, nets, w.floors[0]!.lobbyRoomId, lamp)).toBe(true);
    expect(fixtureSupplied(w, nets, lobby.id, lamp)).toBe(false);
    expect(contactTiles(lamp)).toContain('1,0');
  });

  it('faults are rare and only strike segments in owned rooms', () => {
    const { w, lobby } = setup();
    const other = w.floors[1]!.rooms[lobby.doors[0]!.toRoom]!;
    const c = other.cells[0]!, l = lobby.cells[0]!;
    const cmds = [];
    for (let i = 0; i < 40; i++) {
      cmds.push({ type: 'utilityLaid' as const, roomId: lobby.id, x: l.cx * 19 + 1 + (i % 17), y: l.cy * 11 + 1 + Math.floor(i / 17), kind: 'water' as const });
      cmds.push({ type: 'utilityLaid' as const, roomId: other.id, x: c.cx * 19 + 1 + (i % 17), y: c.cy * 11 + 1 + Math.floor(i / 17), kind: 'water' as const });
    }
    applyCommands(w, cmds);
    let owned = 0, unowned = 0;
    const ticks = 2000;
    for (let t = 0; t < ticks; t++) {
      for (const cmd of utilitiesTick(w, { clock: { day: 1, minute: 400 }, rng: new Rng(t) })) {
        if (cmd.type !== 'utilityFault') continue;
        if (cmd.roomId === lobby.id) owned++;
        else unowned++;
      }
    }
    expect(unowned).toBe(0);
    // Expected faults: 40 segments × ticks × FAULT_CHANCE (rolled from a fresh state each time).
    expect(owned).toBeGreaterThan(0);
    expect(owned).toBeLessThan(40 * ticks * FAULT_CHANCE * 3);
  });

  it('a tenant who needs a utility pays nothing without it, and everyone pays more with it', () => {
    const t = { ...makeApplicant(new Rng(1), 'tU', 's', 1, 1), prefs: [{ kind: 'utility' as const, key: 'water', like: true }, { kind: 'quiet' as const, like: true }] };
    const s = { area: 50, beds: 1, tags: {}, floors: {}, secure: true, quiet: true, connected: true, borderUnsecured: 0, borderUncleared: 0, power: false, water: false };
    expect(missingNeed(t, s)).toBe('water');
    expect(valuation(t, s)).toBe(0);
    expect(valuation(t, { ...s, water: true })).toBeGreaterThan(0);
    const plain = { ...t, prefs: [{ kind: 'quiet' as const, like: true }] };
    expect(valuation(plain, { ...s, power: true, water: true })).toBeGreaterThanOrEqual(valuation(plain, s));
  });
});

describe('sharing tiles and the toolkit', () => {
  it('small furniture stands on a tabletop (one each), and drops to the floor when the table goes', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 91));
    const info = w.floors[1]!.rooms[w.floors[1]!.lobbyRoomId]!;
    const st = w.rooms[info.id]!;
    const L = new RoomLayout(info, st);
    const c = info.cells[0]!;
    const spot = L.findFurnitureSpot(registry.furniture.get('round_table'), c.cx * 19 + 9, c.cy * 11 + 5)!;
    st.furniture.push({ uid: 'T', defId: 'round_table', x: spot.x, y: spot.y, rot: 0 });
    L.rebuildFurniture();
    const lamp = registry.furniture.get('desk_lamp');
    expect(L.canPlaceFurniture(lamp, spot.x, spot.y, 0)).toBe(true);
    expect(L.canPlaceFurniture(registry.furniture.get('chair'), spot.x, spot.y, 0)).toBe(false);
    st.furniture.push({ uid: 'D', defId: 'desk_lamp', x: spot.x, y: spot.y, rot: 0 });
    L.rebuildFurniture();
    expect(L.furnitureAtTile(spot.x, spot.y)?.uid).toBe('D');
    expect(L.onTopOf(st.furniture.find((f) => f.uid === 'D')!)?.uid).toBe('T');
    // The table is full now.
    expect(L.canPlaceFurniture(registry.furniture.get('fern'), spot.x, spot.y, 0)).toBe(false);
    // Carry the table off: the lamp is on the floor.
    st.furniture = st.furniture.filter((f) => f.uid !== 'T');
    L.rebuildFurniture();
    expect(L.onTopOf(st.furniture.find((f) => f.uid === 'D')!)).toBeUndefined();
    expect(L.furnitureAtTile(spot.x, spot.y)?.uid).toBe('D');
  });

  it('a toolkit has six slots for renovation gear, and the apartment stash starts with a full-ish one', () => {
    const kit = makeItem('toolkit');
    expect(kit.contents).toHaveLength(6);
    expect(kitAccepts(makeItem('wire_spool'))).toBe(true);
    expect(kitAccepts(makeItem('roll_carpet_teal'))).toBe(true);
    expect(kitAccepts(makeItem('crowbar'))).toBe(true);
    expect(kitAccepts(makeItem('hoodie'))).toBe(false);
    expect(kitAccepts(makeItem('toolkit'))).toBe(false);
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 92));
    const box = w.rooms[w.floors[0]!.lobbyRoomId]!.furniture.find((f) => f.defId === 'storage_box')!;
    const stashed = box.contents!.find((i) => i?.defId === 'toolkit')!;
    expect(stashed.contents!.filter(Boolean).map((i) => i!.defId)).toContain('wire_spool');
  });
});
