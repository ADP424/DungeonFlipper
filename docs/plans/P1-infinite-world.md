# P1: Infinite World

> **Status:** implemented (2026-10-08). Typecheck and all tests pass, and the flow was verified in a headless browser. Template `$`/`L` slots were placed by a script (along walls, clear of doorways); adjust them freely. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D5, D11, D17, D29, D30, D33, D34).

## Goal
Floors stop being fixed 10–14 room mazes. They grow outward forever as you explore, getting harder with distance from the lobby. Which enemies spawn is chosen by difficulty instead of being hard-coded in templates. Boss rooms (and the stairs down) turn up rarely and farther out. Each floor's entry is a lobby with an elevator. Furniture stops dropping from enemies and is found in rooms instead.

## Scope
| # | Item | Ref |
|---|---|---|
| 1 | Lazy expansion: rooms are generated one step ahead of the player, forever | D5 |
| 2 | Difficulty: floor baseline + cell distance from the lobby | D29 |
| 3 | Spawn slots plus a threat budget (templates mark slots, generation picks enemies) | D33 |
| 4 | Boss rooms: rare, gated by `minDifficulty`, each with a stairs room behind it | D34 |
| 5 | Lobbies and elevator: fast travel between discovered floors' lobbies | D17, D30 |
| 6 | Furniture: drops removed, furniture slots in templates filled by difficulty | D11 |
| 7 | Saves: region docs instead of one growing `floor:N` doc; schema v5 | D5 |

**Deferred:**
- **Template `layers` (D28):** to P6 (utilities). Their first real consumer is pre-laid pipes. The existing template `furniture` list already covers fixed placements like the elevator.
- **IndexedDB:** the client still saves the whole world to localStorage (about a 5 MB budget). That's fine for several hundred explored rooms. A test reports state size per room, and moving to IndexedDB is a later task if needed.

---

## 1. Lazy expansion
- **The invariant:**
  - A room is **expanded** once its door list is final.
  - Every room the player has *entered* is expanded.
  - Every room behind an expanded room's door exists (generated, "discovered" on the map) but may be unexpanded.
- **Entering an unexpanded room R expands it before it loads.** For each free cell edge of R:
  - Roll to attach a new room. The chance falls with R's door count, so rooms average 2–3 exits and corridors don't explode.
  - New rooms may also connect to *unexpanded* neighbours (loops), never to expanded ones, so a room you've seen never grows a new door.
  - If R ends up with no new exits and the frontier would close, one attachment is forced. That way a floor can never dead-end: some unexpanded room always has a free edge.
- **Generation is client-side:** one `roomsGenerated { floor, rooms: RoomInfo[], states: RoomState[], doorsAdded }` command per expansion. The reducer applies it like `floorGenerated`, and the server replays it.
- **Determinism:** the rng for each expansion is `deriveSeed(seed, floor:expand:<roomId>)`. The outcome still depends on what already exists, which is fine because the commands are what persist.
- `FloorBuilder` already supports resuming from an existing floor (`existing` constructor arg) and `attach`. Expansion is `new FloorBuilder(floor, seed, existingFloor).expand(roomId)`. `generateFloor` shrinks to "place lobby + expand lobby".
- **Existing saves:** rooms already visited are marked expanded, and unvisited rooms are not. So old finite floors start growing from their unexplored edges.

## 2. Difficulty
- `difficulty(room) = FLOOR_BASELINE × (floor − 1) + distance / RING_CELLS`, where `distance` is the Euclidean distance (in cells) from the lobby cell to the room's nearest cell. Values: `RING_CELLS = 3`, `FLOOR_BASELINE = 4` (Q1).
- It is stored on `RoomInfo.difficulty` at generation, so later tuning never reshuffles existing rooms.
- Shown on the phone's map as a subtle tint per room (darker = harder). No numbers, per the minimal-GUI rule.

## 3. Spawn slots and the threat budget
- **New legend entries:**
  - `{ slot: { tags?: string[] } }`: any enemy, or enemies with all the listed tags.
  - `{ slot: { enemies: string[] } }`: pick from this list. A one-item list pins a specific enemy at that coordinate (Q4).
  - `{ slot: { boss: true } }`.
- **List slots are the author's call:** they always spawn, ignore the difficulty cap, are filled first, and count against the budget.
- **Converting existing templates:** today's letters become slots. `s r b g` become `e` (any), `a c x` become `R` (ranged), `i` becomes `F` (flyer), `k` becomes `M` (brute). The templates keep their shapes and flavour, and the content (which enemy) moves to generation.
- **At generation:**
  - `budget = 3 + 2.5 × difficulty` threat points.
  - Candidates: enemies whose tags match the slot and whose `threat ≤ 1 + difficulty`.
  - Slots are filled in a seeded random order with a weighted pick (weight rises with threat up to the cap) until the budget runs out. Leftover slots stay empty, so easy rooms are sparse.
  - The roster records the chosen `defId` per spawn id, as today.
- **Past the content ceiling** (difficulty above the top threat in the game), enemies get an HP multiplier `1 + 0.15 × (difficulty − maxThreat)`. This replaces today's per-floor `hpMul`. It's stored on the roster record (`hpMul`) so it stays stable.

## 4. Boss rooms and stairs
- **During expansion,** each new room has a `bossChance(difficulty)` of being a boss room instead, if any boss is eligible (`boss.minDifficulty ≤ difficulty`). The boss slot picks among the eligible bosses, favouring the hardest. A **stairs-down room is attached behind each boss room** (the soft "boss room has stairs" rule, as a template default via `RoomTemplateDef.attach: ['stairsDown']`).
- **Pure random (Q2):** a fixed `BOSS_CHANCE` (≈4%) per eligible new room, with no pity timer. Unlucky floors can take a while to show a way down. That's accepted, and the elevator keeps earlier floors reachable.
- `bone_warden.minDifficulty` changes from 0 to **3** (about 9 cells out on floor 1).
- **Several stairs rooms per floor all lead to the next floor's lobby.** Stairs up from a lobby return to the stairs room you last came down from (`FloorState.lastStairsDown`).

## 5. Lobbies and elevator
- **The lobby:**
  - Each floor's entry room is a **lobby** (`'lobby'` room tag).
  - On floor 1 the safe room stays both home and lobby until P2 splits the apartment out.
  - Floors 2+ use a new `lobby` template that replaces `stairs_up_room` (stairs up, plus an elevator).
  - Lobbies have no enemies, so they're claimed on entry like any empty room.
- **The elevator:**
  - It's **fixed furniture** with `use: { id: 'elevator' }`, the same mechanism as the home bed.
  - Clicking it opens a tiny floor picker listing the floors whose lobby you've visited.
  - Riding counts as one screen transition (15 min).
  - It works from any lobby you've visited.
  - The floor picker is a small DOM panel in the phone's style.
- `FloorState` gains `lobbyRoomId` (`entryRoomId` is renamed in the migration).

## 6. Furniture from the world
- **Drops removed:**
  - The furniture entries are removed from the `common`, `tough` and `boss` loot tables.
  - `LootEntry`'s furniture variant, `enforceSingleTileFiller` and the client's furniture-drop branch are deleted.
  - The CLAUDE.md rule "an enemy drops at most one tile-filling item" goes away.
- **Furniture slots:**
  - A new legend entry `{ furnitureSlot: { tags?: string[] } }` (char `$`) marks spots in templates.
  - At generation each slot rolls `FURNITURE_SLOT_CHANCE` (≈0.6) and picks a furniture def weighted by `FurnitureDef.value`: better pieces get likelier as difficulty rises.
  - `FurnitureDef` gains `value: number` (1 = stool … 5 = piano) and optional `tags` (`'light'`, `'seat'`, `'table'`, `'storage'`…), so a slot can ask for "a light".
  - The placed furniture uses the same uid scheme as map furniture (`<room>-map<mx>,<my>`).
- **Getting it home:** because cleared rooms are claimed immediately (until P3 separates cleared from secured), furniture in a cleared room is already movable. Carrying it into rooms you don't own stays blocked.
- **Boss rewards:** the boss template gets 2–3 high-value furniture slots instead of the boss loot table's guaranteed furniture.
- **Content work:** add 2–4 `$` slots to each of the 12 normal templates and the boss template.

## 7. Saves: region docs and schema v5
- **Region docs:** `DocKey` gains `region:<floor>:<rx>,<ry>`, with regions of 8×8 cells. A region doc holds the `cells` entries and `RoomInfo`s whose first cell lies in that region. `floor:N` keeps only the floor metadata (seed, lobby, counters).
- **Server:** a new `regions` table in `db.ts`, the same shape as `rooms`. The reducer returns region keys for `roomsGenerated`.
- **Client state is unchanged in memory:** `FloorState.cells` and `rooms` remain complete maps. Only the persistence split changes, so game code doesn't care.
- **Schema v5 migration:**
  - `entryRoomId` becomes `lobbyRoomId`.
  - `stairsDownRoomId` becomes `stairsDownRoomIds[]`.
  - `RoomInfo.expanded = visited`.
  - `RoomInfo.difficulty` is computed.
  - Old floors' `boss`/`stairsDown` rooms are kept.
  - Server docs are re-split into regions.
  - Existing rosters are untouched: their enemies stay as generated.

---

## Files (main)
- **Shared:**
  - `world/generator.ts` (expansion, difficulty, slot filling, boss placement), new `world/difficulty.ts`
  - `world/types.ts` (`RoomInfo.difficulty/expanded`, `FloorState` changes), `world/commands.ts` (`roomsGenerated`, region doc keys)
  - `save/schema.ts` (v5)
  - `content/types.ts` (legend `slot`/`furnitureSlot`, `FurnitureDef.value/tags`, template `attach`), `content/index.ts` (validation)
  - all `content/roomTemplates/*`, `content/furniture/*`, `content/lootTables/*`
  - new `content/furniture/elevator.ts` and `content/roomTemplates/lobby.ts`
  - `loot/roll.ts`
- **Client:**
  - `game/Game.ts` (expand before load, elevator travel, stairs targets, remove furniture drops, HP multiplier from the roster)
  - `game/actions/furnitureUses.ts` (`elevator`), `game/actions/triggers.ts`
  - new `ui/FloorPicker.ts`, `ui/MapView.ts` (difficulty tint)
- **Server:** `apps/server/src/db.ts` (regions table, migration rewrite)

## Verification
- **Unit tests:**
  - Expansion keeps the invariant: visited rooms never gain doors, there are no overlaps, and the doors pair up.
  - A random walk of about 300 rooms never dead-ends.
  - Difficulty rises with distance.
  - Slot filling stays within budget and respects tags.
  - A boss is guaranteed within the pity window.
  - The v4→v5 migration works.
  - Region keys come back from `roomsGenerated`.
  - The server persists and reloads regions.
- **Manual:**
  - Walk outward and watch the map grow and darken.
  - Enemies change from rats and slimes near the lobby to knights and cultists farther out.
  - Find a boss room, beat it, take the stairs, use the elevator back to floor 1.
  - Furniture appears in rooms and none drops from enemies.

## Decisions (P1)
- **Q1:** difficulty +1 per 3 cells, +4 per floor.
- **Q2:** boss rooms are pure random, about 4% per eligible room, with no pity timer.
- **Q3:** found furniture comes from authored `$` slots in templates, optionally tag-filtered, filled by difficulty.
- **Q4:** spawn slots are random within optional tag categories. Templates can also pin a specific enemy at a coordinate, or choose from a specific list.
- **Elevator (decided without asking):** you can ride from any lobby you've visited. P3 may restrict this to secured lobbies.
