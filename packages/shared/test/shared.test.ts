import { beforeAll, describe, expect, it } from 'vitest';
import {
  CELL_H, CELL_W, HealthStack, MAX_STACK, Rng, RoomLayout, SCHEMA_VERSION, WallBits, addToHotbar, applyCommands,
  countLeft, createItem, emptyWorld, enforceSingleTileFiller, generateFloor, initialRoomState, migrate,
  newWorldCommands, pickEntry, registerAllContent, registry, rollLoot, Stats, wallMask, wallQuarters,
  type Hotbar, type LootTableDef, type RoomInfo, type RoomState,
} from '../src';

beforeAll(() => registerAllContent());

describe('loot', () => {
  const table: LootTableDef = {
    id: 't',
    drops: [
      { chance: 0.5, entries: [{ chance: 0.5, item: 'heart' }, { chance: 0.25, gold: 5 }] },
      { chance: 1, entries: [{ chance: 1, item: 'dagger' }] },
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
        if (r.kind === 'item' && r.item === 'heart') hearts++;
        if (r.kind === 'gold') gold++;
        if (r.kind === 'item' && r.item === 'dagger') daggers++;
      }
    }
    expect(daggers).toBe(N);
    expect(hearts / N).toBeCloseTo(0.25, 1);
    expect(gold / N).toBeCloseTo(0.125, 1);
  });

  it('keeps only the last tile-filling drop', () => {
    const out = enforceSingleTileFiller([
      { kind: 'furniture', furniture: 'chair' },
      { kind: 'gold', amount: 1 },
      { kind: 'furniture', furniture: 'bed' },
    ]);
    expect(out).toEqual([{ kind: 'gold', amount: 1 }, { kind: 'furniture', furniture: 'bed' }]);
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
  return { id, floor: 1, owned: false, discovered: false, visited: false, deadSpawnIds: [], tileOverrides: {}, floorSurfaces: {}, wallSurfaces: {}, furniture: [], groundItems: [] };
}

describe('layout', () => {
  it('builds an L-shaped room with walls only on outer edges', () => {
    const info: RoomInfo = {
      id: 'L', floor: 1, templateId: 'l_bend', mirrorX: false, mirrorY: false,
      cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }], doors: [], tags: ['normal'],
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
    const info: RoomInfo = { id: 'r', floor: 1, templateId: 'low_wall_cover', mirrorX: false, mirrorY: false, cells: [{ cx: 0, cy: 0 }], doors: [], tags: [] };
    const l = new RoomLayout(info, emptyState('r'));
    // Template row 2 col 3 is a short wall → global (4,3).
    expect(l.obstacleIdAt(4, 3)).toBe('stone_wall_short');
    expect(l.blocksProjectile(4, 3, 'straight')).toBe(true);
    expect(l.blocksProjectile(4, 3, 'lobbed')).toBe(false);
    expect(l.blocksMovement(4, 3, 'walk')).toBe(true);
    expect(l.blocksMovement(4, 3, 'fly')).toBe(false);
    expect(l.blocksProjectile(0, 0, 'lobbed')).toBe(true);
    const hole = registry.obstacles.get('hole');
    expect(hole.blocksMovement).toEqual(['walk']);
    expect(hole.blocksProjectiles).toEqual([]);
  });
});

describe('generator', () => {
  it('is deterministic and connected, with boss and stairs', () => {
    const a = generateFloor(1234, 1);
    const b = generateFloor(1234, 1);
    expect(JSON.stringify(a.floor)).toBe(JSON.stringify(b.floor));
    const rooms = Object.values(a.floor.rooms);
    expect(rooms.length).toBeGreaterThanOrEqual(12);
    // Connectivity via doors
    const seen = new Set([a.floor.entryRoomId]);
    const q = [a.floor.entryRoomId];
    while (q.length) for (const d of a.floor.rooms[q.shift()!]!.doors) if (!seen.has(d.toRoom)) { seen.add(d.toRoom); q.push(d.toRoom); }
    expect(seen.size).toBe(rooms.length);
    expect(rooms.some((r) => r.tags.includes('boss'))).toBe(true);
    expect(a.floor.stairsDownRoomId).toBeDefined();
    // Doors line up: every door's partner exists in the other room, adjacent.
    for (const r of rooms) for (const d of r.doors) {
      const other = a.floor.rooms[d.toRoom]!;
      expect(other.doors.some((o) => o.toRoom === r.id && Math.abs(o.x - d.x) + Math.abs(o.y - d.y) === 1)).toBe(true);
    }
  });

  it('generates many seeds without overlap', () => {
    for (let s = 0; s < 30; s++) {
      for (const f of [1, 2, 3]) {
        const { floor } = generateFloor(s, f);
        const owners = new Map<string, string>();
        for (const r of Object.values(floor.rooms)) for (const c of r.cells) {
          const k = `${c.cx},${c.cy}`;
          expect(owners.has(k)).toBe(false);
          owners.set(k, r.id);
        }
        expect(floor.stairsDownRoomId).toBeDefined();
      }
    }
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
    const safe = a.rooms[a.floors[1]!.entryRoomId]!;
    expect(safe.owned).toBe(true);
    expect(safe.furniture.some((f) => f.defId === 'storage_chest')).toBe(true);
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

  it('death wipes the hotbar but keeps gold', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 5));
    applyCommands(w, [{ type: 'playerUpdated', playerId: 'p1', patch: { gold: 50 } }]);
    applyCommands(w, [{ type: 'playerDied', playerId: 'p1', respawn: { floor: 1, roomId: 'f1r0', x: 9, y: 5 }, redHalves: 6 }]);
    const p = w.players.p1!;
    expect(p.gold).toBe(50);
    expect(p.hotbar.main).toBeNull();
    expect(p.hotbar.off).toBeNull();
  });
});

it('cell constants match the default 16:9-ish room', () => {
  expect(CELL_W - 2).toBe(17);
  expect(CELL_H - 2).toBe(9);
});

const room = (templateId: string, cells = [{ cx: 0, cy: 0 }]): RoomInfo =>
  ({ id: 'r', floor: 1, templateId, mirrorX: false, mirrorY: false, cells, doors: [], tags: [] });

describe('wall autotiling', () => {
  const pieces = (L: RoomLayout, x: number, y: number) => wallQuarters(wallMask(L, x, y)).map((q) => `${q.piece}${q.rot}`).join(' ');
  const withWalls = (tiles: [number, number][]) => {
    const st = emptyState('r');
    for (const [x, y] of tiles) st.tileOverrides[`${x},${y}`] = 'stone_wall';
    return new RoomLayout(room('safe_room'), st);
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
    st.tileOverrides['1,5'] = 'stone_wall_short';
    st.tileOverrides['2,5'] = 'plaster_wall';
    const L = new RoomLayout(room('safe_room'), st);
    expect(wallMask(L, 1, 5) & WallBits.W).toBeTruthy();
    expect(wallMask(L, 0, 5) & WallBits.E).toBeTruthy();
    expect(wallMask(L, 2, 5) & WallBits.W).toBeTruthy();
  });
});

describe('stacks', () => {
  const hotbar = (): Hotbar => ({ main: null, off: null, armor: null, slots: [null, null] });

  it('merges matching tools and rolls up to the cap', () => {
    const hb = hotbar();
    const a = createItem('plaster_kit', 'a', { count: 8 });
    expect(addToHotbar(hb, a)).toBe(true);
    expect(addToHotbar(hb, createItem('plaster_kit', 'b', { count: 16 }))).toBe(true);
    expect(countLeft(hb.main!)).toBe(24);
    expect(hb.slots).toEqual([null, null]);
    hb.main!.data.count = MAX_STACK - 4;
    expect(addToHotbar(hb, createItem('plaster_kit', 'c', { count: 10 }))).toBe(true);
    expect(countLeft(hb.main!)).toBe(MAX_STACK);
    expect(countLeft(hb.slots[0]!)).toBe(6);
  });

  it('keeps the remainder when the hotbar is full', () => {
    const hb = hotbar();
    hb.main = createItem('roll_carpet_teal', 'm', { count: MAX_STACK - 2 });
    hb.slots = [createItem('dagger'), createItem('hammer')];
    const it = createItem('roll_carpet_teal', 'x', { count: 5 });
    expect(addToHotbar(hb, it)).toBe(false);
    expect(countLeft(hb.main)).toBe(MAX_STACK);
    expect(countLeft(it)).toBe(3);
  });

  it('starts tools and rolls with whole-unit counts', () => {
    expect(countLeft(createItem('plaster_kit'))).toBe(16);
    expect(countLeft(createItem('roll_wallpaper_rose'))).toBe(32);
    expect(createItem('hammer').data.halves).toBeUndefined();
  });
});

describe('map furniture', () => {
  it('turns template-map braziers into liftable furniture', () => {
    const info = room('stairs_down_room');
    const st = initialRoomState(info);
    const braziers = st.furniture.filter((f) => f.defId === 'brazier');
    expect(braziers).toHaveLength(4);
    const L = new RoomLayout(info, st);
    expect(L.obstacleIdAt(braziers[0]!.x, braziers[0]!.y)).toBeNull();
    expect(L.furnitureAtTile(braziers[0]!.x, braziers[0]!.y)?.defId).toBe('brazier');
  });
});

describe('migration', () => {
  it('removes shields, converts halves to counts and adds braziers to old rooms', () => {
    const w = emptyWorld();
    applyCommands(w, newWorldCommands('p1', 7));
    const floor = w.floors[1]!;
    const id = 'f1rX';
    floor.rooms[id] = { ...room('stairs_down_room'), id };
    w.rooms[id] = { ...emptyState(id), groundItems: [{ uid: 'g', x: 3, y: 3, item: { uid: 'i', defId: 'tower_shield', data: {} } }] };
    // One brazier was demolished in the old save: it must stay gone.
    const gone = new RoomLayout(floor.rooms[id]!, initialRoomState(floor.rooms[id]!)).state.furniture.find((f) => f.defId === 'brazier')!;
    w.rooms[id]!.tileOverrides[`${gone.x},${gone.y}`] = null;
    const p = w.players.p1!;
    p.hotbar.off = { uid: 's', defId: 'wooden_shield', data: {} };
    p.hotbar.main = { uid: 'k', defId: 'plaster_kit', data: { halves: 7 } };
    const old = JSON.parse(JSON.stringify({ ...w, schemaVersion: 1 }));

    const m = migrate(old);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.players.p1!.hotbar.off).toBeNull();
    expect(m.players.p1!.hotbar.main!.data).toEqual({ count: 7 });
    expect(m.rooms[id]!.groundItems).toEqual([]);
    expect(m.rooms[id]!.furniture.filter((f) => f.defId === 'brazier')).toHaveLength(3);
    // Safe room chest contents survive untouched.
    const chest = m.rooms[floor.entryRoomId]!.furniture.find((f) => f.defId === 'storage_chest')!;
    expect(chest.contents!.filter(Boolean).length).toBeGreaterThan(0);
  });
});
