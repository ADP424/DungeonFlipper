# P3: Securing

> **Status:** implemented (2026-10-08). Typecheck and all tests pass, and the flow was verified in a headless browser. The model follows the owner's mid-phase correction: monsters spill through any unbarricaded door until the room is at capacity (section 2). Also fixed: the camera now keeps the room clear of the right-hand hotbar, which used to swallow clicks on east doorways. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D3, D9, D10, D13, D14, D37, D46–D50).

## Goal
Owning a room isn't the end of the fight. Unowned rooms next to your property keep filling up with monsters, and those monsters bash at your doors. You **secure** a room by barricading every door that faces an unowned room, using a barricade at least as strong as the room behind it demands. Barricades wear down every in-game hour. When one breaks, monsters pour in, and the room has until the end of the next day to be re-secured before you lose it.

## Concepts
- **Cleared:** a room with no monsters that nobody owns.
  - You may barricade its doors and haul its furniture out, but nothing else (Q1).
  - It becomes **owned** the moment it's empty and every door is either barricaded at the required tier or leads to a room you own.
  - So it can be all barricades, all owned neighbours (claimed on clearing, D13), or any mix.
- **Owned:** `ownerId` is you. You can renovate and furnish.
- **Secure:** owned, no monsters inside, and every door is either barricaded at the **required tier** or leads to a room the same owner owns. `isSecure()` already gates sleeping, free transitions and the midnight rule; only its body changes. The apartment is always secure.
- **Required tier:** `1 + floor(neighbourDifficulty / 3)`, capped at 4. Level 1 near the lobby needs planks; four rings out needs steel.
- **Deadline (breaches only):** an owned room that is not secure gets `insecureSince = <day>`. At the end of each day, a room still insecure since an *earlier* day loses its owner. That gives you until the end of the day after a breach (D3).
- **Lobbies are normal rooms (Q4).**
  - They start owned but unbarricaded, so they start insecure. They must be boarded up by the end of day 2, or they're lost like any room.
  - The starter stash includes plank kits for this.

## 1. Barricades (D9, D37)
| Tier | Item | HP | Passable by you | Notes |
|---|---|---|---|---|
| 1 | Plank Barricade | 20 | **No**: pry it off with a crowbar (1 use), then re-place it | Cheap |
| 2 | Security Door | 50 | Yes | |
| 3 | Steel Door | 120 | Yes | |
| 4 | Blast Door | 300 | Yes | |

- **Kits:** each is a `tool` item with action `barricade { tier }`, stacking like other tools.
  - Click a door tile in an owned room with no enemies to install, repair (back to full) or upgrade. Each costs 1 use.
- **Storage:** `RoomState.barricades: Record<"x,y" (this room's door tile), { tier, hp }>`, on the secured side (D37).
- **Blocking:** every tier stops monsters and straight projectiles (the doors already stop monsters). Tier 1 also stops you. Higher tiers open for you; tenants later too.
- **Visuals:** a placeholder procedural sprite per tier, with crack overlays at <66% and <33% HP. Hovering a door with a kit shows its tier and HP in the tile outline tooltip.
- **Where kits come from (Q2): both sources.**
  - **The phone's Hardware app** sells priced items (`ItemBase.price`) for cash. Orders arrive at the apartment as ground items on the next wake-up. This is the first cash sink.
  - **Loot:** plank kits from `common`, security doors from `tough`, and steel doors from `boss`.
  - **Prices (to tune):** plank $5 (3 uses), security door $25, steel $60, blast $150 (2 uses each).

## 2. Doors spill monsters; barricades hold them back (D10, D46, D48)
These are all **hourly resolvers** (`registerHourly`). They're seeded and emit commands, and the server replays only the commands. They run only for rooms you have **visited**; unseen rooms keep their generated rosters.
- **Unsecured doors spill monsters (owner's rule).** A door is a *monster source* unless it is barricaded, or the room behind it is owned and calm (no monsters).
  - Each hour, each source door has `SPAWN_CHANCE` (≈0.25) to let one monster in, until the room reaches **capacity** (total threat ≤ `threatBudget(room difficulty)`).
  - The monster is chosen like a spawn slot at the room's difficulty. It enters through that door and is placed just inside it.
  - So a cleared room refills unless you barricade it. A room with monsters spilling in is never owned.
- **Barricades wear down:**
  - Each hour, a barricade facing a source loses `0.25 × (1 + difficulty of the room behind it)` HP.
  - HP per tier: 20 / 80 / 160 / 300. So the required tier lasts about 2 days at the low end of its difficulty range (Q3), and an over-spec barricade lasts longer.
- **Breach:** when a barricade reaches 0 HP:
  - It's destroyed and a monster comes through at once. The door is a source again.
  - In an owned room this starts the deadline and sends an **urgent** phone message.
- **Breached rooms are hot (D46):** an owned room with monsters is not calm, so its unbarricaded internal doors spill into its neighbours too. Nothing cascades instantly.
- **Live rooms:** time passes during transitions and sleep. After it passes, the room you're standing in is reconciled. New monsters spawn live at their door, and broken barricades disappear.
- **Tuning knobs** (`world/securing.ts`): `SPAWN_CHANCE`, the pressure formula and tier HP.

## 3. Claiming and losing rooms
- **Clearing doesn't claim (Q1).** The banner says how many doors still need barricading, and at which tier. The claim happens on the barricade that completes the set, or on clearing when there's nothing to barricade.
  - Each claim also re-checks neighbouring cleared rooms, since one of their frontier doors may have just stopped being frontier.
- **Losing a room:**
  - `roomOwnerCleared` resets the owner.
  - Barricades and furniture stay where they are. You can re-clear the room and reclaim it.
  - An urgent message is sent.
- **Daily summary (wake-up digest):** lists rooms that are insecure, with their deadlines, and barricades below 33% HP.

## 4. UI (minimal)
- **Map:** owned and secure is gold, owned and insecure is amber, breached (monsters inside) is red. The phone map makes this the main overview.
- **Entering an owned, insecure room:** a toast says "N doors need barricading (tier T)". Doors that need a barricade get a faint red outline while you hold a barricade kit.

## 5. Data and save changes
- `RoomState.barricades`, `RoomState.insecureSince?`, and `MonsterRecord.door?` (the "x,y" tile it entered through).
- New commands:
  - `barricadeSet { roomId, door, barricade | null }`
  - `barricadesDamaged { roomId, hp: { door: hp } }`
  - `roomInsecure { roomId, since | null }`
  - `monsterAdded { roomId, record }`
- Schema v8. Saves are wiped between phases, so there's no migration.

## Files (main)
- **Shared:**
  - new `world/securing.ts` (tiers, `requiredTier`, `frontierDoors`, the `isSecure` body, resolvers)
  - `world/ownership.ts`, `world/types.ts`, `world/commands.ts`, `world/layout.ts` (barricade blocking)
  - `content/items/tools/*` (kits), `content/roomTemplates/apartment.ts` (starter kits)
- **Client:**
  - `game/actions/tools.ts` (`barricade` action, crowbar prying)
  - `game/Game.ts` (resolver registration, live roster sync, exit rules)
  - `render/RoomRenderer.ts` (barricade sprites), `engine/procedural.ts`
  - `ui/MapView.ts`, `ui/Phone.ts` (digest)

## Verification
- **Unit tests:**
  - `requiredTier`
  - `isSecure` with a missing, too-weak or adequate barricade
  - pressure decay and breach under a seeded rng
  - deadline loss at the end of the next day (not the same day)
  - spills stop at capacity
  - only visited rooms refill
  - a calm owned neighbour is not a source
- **Manual:**
  1. Claim a room, then barricade it: it should become secure (gold on the map), and you can sleep there.
  2. Skip time with F10: barricades crack, then break, and you get an urgent message with monsters inside.
  3. Re-clear the room and re-barricade it before the deadline. Then let a room lapse and lose it.

## Decisions (P3)
- **Q1:** cleared rooms stay unowned until secured. You may barricade cleared rooms and carry their furniture out.
- **Q2:** kits come from both the phone's Hardware app (next-morning delivery to the apartment) and loot.
- **Q3:** an unattended Level 1 plank barricade lasts about 2 days.
- **Q4:** lobbies are normal rooms. They need barricading and can be breached and lost.

## Follow-up changes (owner feedback after the first P3 build)
- **Ticks:** everything off-screen runs per 15-minute tick (`registerTick`) or per day; there are no hourly resolvers. Spill chance is 0.07 per door per tick (about 25%/hour). Wear is `0.0625 × (1 + difficulty)` per tick.
- **Monsters only come from uncleared rooms:** a door spills only if the room behind it has monsters. So only rooms bordering uncleared rooms repopulate, and barricading some doors blocks those directions even while the room stays unowned. Repopulated unowned rooms send an info message and go dark on the map at once (the map redraws on every dispatched command).
- **Barricades belong to the doorway:** they're mirrored onto both door tiles with one shared HP, and wear once per tick. You can't barricade between two rooms you own.
- **Removal:**
  - Holding left-click on a barricade tears it down, at 1 s per tier, and it's lost.
  - A crowbar pries it off whole and returns a kit carrying its remaining HP. Worn kits stack only with equally worn ones. A worn kit can't "repair" a barricade in better shape.
  - Other demolition tools smash barricades.
- **Either hand:** tools, rolls and weapons go in either hand; right click uses the off hand.
- **Furniture** lifted in a cleared room can be put down there, and carried into other cleared rooms.

## Follow-up changes (second round of owner feedback)
- **Claiming by flag:**
  - A **company flag** item (`plantFlag` action) is planted on an open tile of a cleared room. It becomes `company_flag` furniture (fixed, `claimsRoom`) and the room is owned.
  - You start with 4 flags in the stash. Flags drop from loot: common 2%, tough 6%, boss always.
  - Crafting flags from found materials is deferred.
  - The barricade-based claim (`claimable`/`tryClaim`) is gone.
- **Security** only counts doors into *uncleared* rooms. Doors into cleared or owned rooms need nothing. Unbarricaded doors into uncleared rooms now let monsters in at **25% per tick**, up from 7%.
- **Losing a room** takes its flag down.
- **UI:**
  - Hovering a barricade shows a durability bar.
  - Hotbar items: stacks (kits, plywood, rolls) show a count in the corner. Things with durability (armor, dual-use tools, pried barricades) show a bar instead. The first try, bars with pips on stacks, didn't read well.
  - The phone icon is now hotbar-slot sized, and the clock is always visible to its left under the minimap. The hotbar moved down to make room.
- **Corner clicks:** HUD over the room (minimap, phone, clock, upgrades strip) fades and becomes click-through while you're within about 3.5 tiles of it. The alternative, shrinking the room to clear the HUD vertically, would waste screen space.

## Follow-up changes (third round)
- **Map barricades:** barricades are drawn in their doorways, coloured by wear.
- **Map hover tooltips** (full map):
  - **Rooms:** name, then status (home / yours and secure / not secure, with doors needed and tier / monsters inside / deadline / unexplored / cleared and unclaimed), then difficulty. Naming owned rooms comes later.
  - **Barricades:** kind, tier, HP with a bar, and which two rooms they sit between.
