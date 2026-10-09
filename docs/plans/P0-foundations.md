# P0: Foundations

> **Status:** implemented (2026-10-08). Typecheck and all tests pass, and the flow was verified in a headless browser. Deviation from the plan: dev Shift+key combos are captured at keydown (`shift+f10`) in `engine/input.ts`. Roadmap: [../ROADMAP.md](../ROADMAP.md).

## Goal
Lay down the systems every later phase builds on, while the game stays playable and existing saves migrate. P0 has no new gameplay loop. What the player does notice:
- a phone with a clock
- time that passes with each room transition
- sleeping, forced sleep and passing out
- monsters that stay as you left them

## Scope
| # | Item | Roadmap ref |
|---|---|---|
| 1 | `RoomState.owned` becomes `ownerId` | D16, D42 |
| 2 | Monster rosters replace `deadSpawnIds` | D10 |
| 3 | Clock: 15 min per screen transition, hourly/daily resolver loop | D1, D45, D48 |
| 4 | Sleep: voluntary, forced at 12 AM, passing out at 2 AM, waking 8 h later, the home-bed rule | D1 |
| 5 | Phone shell: clock, Messages (digest), and a hook for the room-boundary overlay | D41, D43 |
| 6 | `threat` and `tags` on `EnemyDef` (data only) | D33 |
| 7 | Schema v3, the migration, and outbox compatibility | |
| 8 | Dev keys and docs (CLAUDE.md rule rewrites, README dev keys) | |

**Deferred to P1:** template `layers` and `placements` (D28). P0 has no consumer for them, and the first consumers are the lobby elevator and utility sources. The existing `RoomTemplateDef.furniture` list will be generalised into `placements` then.

---

## 1. Ownership (`ownerId`)
- `RoomState.owned: boolean` becomes **`ownerId: string | null`**.
  - Add `isOwnedBy(room, actorId)` in `world/ownership.ts`.
  - Add `isSecure(state, roomId)`. In P0 it returns *owned by anyone*; P3 replaces its body with the barricade rule. All "safe area" checks go through `isSecure`, so P3 changes only one function.
- `roomOwned { roomId, ownerId }` sets the owner. Add **`roomOwnerCleared { roomId }`**, which nothing dispatches until P3 (breach deadline), so the reducer and server are ready.
- **Client call sites:** these become `isOwnedBy(room, session.playerId)`:
  - `Game.ts` (ambient light, `exitAllowed`, `checkRoomClear`, renovation guard)
  - `Player.ts:146/160/265/281`
  - `RoomRuntime.ts:42`
  - `MapView.ts:38`
- **`startsOwned` templates:** generation can't know the player id (the floor is generated before the player exists). So the generator writes the sentinel `ownerId: '@world'`, and the reducer resolves it to `state.ownerId` when `floorGenerated` is applied. This also keeps snapshot replay correct.

## 2. Monster rosters
- **New field:** `RoomState.monsters: MonsterRecord[]`, where `MonsterRecord = { id; defId; hp?; spawnId? }`.
  - `hp` is absent when the monster is at full health.
  - Monsters spawned by the template use `id = "s:<mx>,<my>"` and keep `spawnId` so they appear at their template tile. Later incursion monsters (P3) get a uid and no `spawnId`, and are placed near the door they came through.
- **Generation:** `floorGenerated` rooms are created with their roster pre-filled from `RoomLayout.spawns`. `liveSpawns()` is replaced by `RoomLayout.rosterPlacements()`, which resolves each record to a position.
- **Commands:**
  - `monsterKilled { roomId, monsterId }` replaces `enemyKilled`.
  - `rosterSynced { roomId, monsters }` is dispatched on room exit when any HP changed.
- **Summons stay transient.** They aren't persisted, and they still die when the room is cleared or the boss dies.
- **Cleared** means the roster is empty. `checkRoomClear` checks the roster plus the live entities.
- **HP scaling:**
  - Keep today's floor-depth `hpMul` (P1 replaces it with difficulty).
  - `hp` is stored as a fraction of max (0–1), so retuning can never leave a monster with more than its max HP.
- **The CLAUDE.md rules change:** "Enemies never respawn" becomes "template spawns never respawn"; "living enemies reset" becomes "rooms persist their roster (def + HP)".

## 3. Clock
- **State:** `globals.clock = { day: number; minute: number }`.
  - `minute` counts minutes from midnight of the current day and may pass 1440 (1:30 AM = 1530).
  - `day` increments on every wake-up.
  - The clock is world-global, which is fine single-player. Multiplayer sync is still an open roadmap question.
- **Commands:**
  - `timePassed { minutes }`, which touches `global:clock`
  - `clockSet { day, minute }`, used by sleep and by the dev key
- **What costs time:** `Game.loadRoom` from a door transition or stairs dispatches `timePassed { 15 }` **unless both rooms are secure** (D45). Walking between owned rooms is free already in P0, before P4 makes the estate seamless.
- **Resolver loop:** `world/advance.ts` changes to clock-based resolvers.
  - `registerHourly((state, ctx: { day, hour, rng }) => Command[])`
  - `registerDaily((state, ctx: { day, rng }) => Command[])`
  - `advanceClock(state, from, to)` walks every hour boundary crossed, then the day boundary on sleep. It returns the commands, and the caller dispatches them in order.
  - `rng = new Rng(deriveSeed(state.seed, \`${day}:${hour}:${key}\`))` keeps outcomes deterministic and stable under replay.
  - P0 registers **no gameplay resolvers**. A test resolver in the unit tests proves the loop works. P3 (decay, incursions) and P5 (rent) plug in here.

## 4. Sleep
- **Voluntary sleep, at any hour:**
  - **Click a bed** you own: that's where you sleep.
  - Or use the phone's **"Sleep here"** button, which is enabled only while you're in an `isSecure` room; you sleep on the floor.
- **Forced sleep:**
  - After any time step that reaches `minute ≥ 1440` (12 AM) while you're in a secure room, you fall asleep on the spot.
  - In an insecure room, a warning toast and a phone buzz go off at 12 AM and again at 1 AM.
  - Stepping into a secure room after midnight makes you sleep right away.
- **Passing out:** reaching `minute ≥ 1560` (2 AM) in an insecure room means a fade to black and **death** (D15 rules: unstashed inventory lost). You wake at home 8 h later.
- **Waking:**
  - **Wake time = the later of (sleep time + 8 h) and 6 AM the next day.** So going to bed before 10 PM still wakes you at 6 AM; 2 AM wakes you at 10 AM. `day` goes up by 1.
  - The hourly resolvers run over the **whole** slept span. That can be up to about 21 h when you sleep in the morning, which is the self-punishing cost of skipping time.
  - Sleeping in the **home bed** restores full HP. Sleeping anywhere else **heals you up to 2/3 of max at most**. There's no penalty if you were already above 2/3.
  - The home bed is the starter bed in the floor-1 `safe` room, which becomes the apartment bed in P2.
- **The sleep sequence (client):**
  1. Fade out.
  2. Run `advanceClock` over 8 h, then the daily resolvers. Dispatch the results.
  3. Dispatch `slept { playerId, clock, redHalves }`.
  4. Build the digest message.
  5. Fade in with a "Day N" banner.
- **Day 1 starts at 6 AM** (`minute = 360`).

## 5. Phone shell
- **The icon:**
  - A tiny phone icon sits beside the hotbar. Hovering it shows the time and day, and it shows an unread badge.
  - Clicking it opens a mouse-only overlay. It's DOM, in `ui/Phone.ts`, and uses the existing `--u` scaling.
- **The overlay:**
  - **Header:** the clock.
  - **Messages app:** the digest list, newest first, with severity colours (info, warn, urgent).
  - **"Room boundaries" toggle:** a stub until P4 makes boundaries invisible.
  - **Map:** a shortcut to the existing full map.
- **Messages are persisted per player** in `globals["inbox:<playerId>"]`, capped at about 50.
  - Commands: `messagePosted { playerId, message: { id, day, minute, severity, text } }` and `messagesRead { playerId }`.
  - Messages posted in P0: the sleep summary ("Day 4. You slept in the dungeon, -1/3 HP"), the midnight warnings and "You passed out".

## 6. Enemy threat data
- `EnemyDef` gains `threat: number` (a cost in budget points, about 1–10) and `tags: string[]` (`'flyer'`, `'ranged'`, `'swarm'`, `'brute'`…).
- Bosses gain `boss.minDifficulty`.
- Values are set for all 10 enemies and `bone_warden`. Validation in `registerAllContent` rejects `threat <= 0`.
- Nothing reads these in P0; P1's spawn budget does.

## 7. Schema v3 and compatibility
- **The v2→v3 migration:**
  - `owned: true` becomes `ownerId = world.ownerId`, and `owned: false` becomes `null`.
  - Rosters are built from `RoomLayout.spawns` minus `deadSpawnIds`, and then `deadSpawnIds` is deleted.
  - `globals.clock = { day: 1, minute: 360 }`.
  - An empty inbox is created.
- **Outbox compatibility:** players may have v2 commands queued in localStorage. The reducer keeps **legacy handlers**:
  - `enemyKilled { spawnId }` maps to `monsterKilled "s:<spawnId>"`.
  - `roomOwned` without an `ownerId` defaults to `cmd.actorId`.
  - These handlers are marked for removal in a later schema bump.
- **Server:** `db.ts` already persists `global:*` docs and rewrites documents on migrate, so no server code changes are expected beyond tests.

## 8. Dev and docs
- **Dev keys:** F10 = +1 hour (it runs the hourly resolvers), Shift+F10 = jump to 11:45 PM.
- **Docs:** update the dev-key log in `main.ts` and the README list.
- **CLAUDE.md:**
  - Rewrite the respawn and roster rules.
  - Document `isSecure` as the single safety predicate.
  - Note that clock resolvers must be seeded and emit commands.

---

## Files
- **Shared (`packages/shared/src/`):**
  - `world/types.ts`, `world/commands.ts`, `world/advance.ts`
  - new `world/ownership.ts`, new `world/clock.ts` (constants: 15 min per transition, 12 AM/2 AM thresholds, 8 h sleep)
  - `world/layout.ts` (roster placements), `world/generator.ts` (roster and ownership sentinel)
  - `save/schema.ts`
  - `content/types.ts`, `content/index.ts`, `content/enemies/*`, `content/bosses/*`
- **Client (`apps/client/src/`):**
  - `game/Game.ts` (time on transitions, sleep and pass-out flow, roster spawn and sync, ownership helper)
  - `game/RoomRuntime.ts`, `game/entities/Player.ts`, `game/entities/Enemy.ts` (HP fraction)
  - new `ui/Phone.ts`, `ui/Ui.ts`, `ui/MapView.ts`, `styles.css`
  - `main.ts`
- **Tests:** `packages/shared/test/shared.test.ts`, `apps/server/test/server.test.ts`

## Verification
- **Unit tests (shared):**
  - the v2 fixture migrates (ownership, rosters minus dead, clock)
  - legacy `enemyKilled` and `roomOwned` commands still apply
  - `timePassed` and `slept` reducer behaviour
  - `advanceClock` fires a test resolver exactly once per hour boundary, deterministically, across a replay
  - the `@world` sentinel resolves to the owner
- **Server test:** syncing a batch containing the new commands persists `global:clock` and the room rosters.
- **`npm run typecheck`** and **`npm test`**
- **Manual play (`npm run dev`):**
  1. Walk between rooms and check the phone time steps by 15 min, but not between two owned rooms.
  2. Damage a monster, leave and come back: its HP should be kept.
  3. Clear a room: it should be claimed.
  4. Press Shift+F10 to jump to 11:45 PM, then step into an unowned room: you should get warned, then pass out at 2 AM, wake at home at 10 AM, and have died (inventory lost).
  5. Sleep in a non-home owned room while badly hurt: you should wake healed to 2/3 HP with a digest message.
  6. Sleep at 8 PM: you should wake at 6 AM.
  7. Load an old v2 save from localStorage and confirm the migration.

## Decisions (P0)
- **Q1:** sleep by clicking a bed, or anywhere secure with the phone's "Sleep here" button. *Revised after P0:* only the apartment bed (`home_bed`: fixed, `use: sleepHome`) sleeps. Other beds are ordinary furniture (schema v4 converts the old starter bed).
- **Q2/Q5:** you can sleep at any hour. You wake at the later of (sleep + 8 h) and 6 AM the next day. Day 1 starts at 6 AM.
- **Q3:** sleeping away from home heals you up to 2/3 HP at most.
- **Q4:** moving between two owned rooms costs no time, starting in P0.
