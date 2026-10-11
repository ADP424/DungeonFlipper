# P2: Theme Pass

> **Status:** implemented (2026-10-08). Typecheck and all tests pass, and the flow was verified in a headless browser. Also fixed: the top-left HUD (hearts, cash) was swallowing clicks into that corner of the room. Only the upgrades strip catches clicks now, and only when it has icons. Phone Messages now read like a chat (oldest first). Roadmap: [../ROADMAP.md](../ROADMAP.md) (D4, D8, D23, D35, D40, D51).

## Goal
The game stops being generic fantasy. You play an ambitious property developer who finds a portal to an endless, dangerous office-and-apartment space (Backrooms-style, light comedic horror). You start in your shabby real-world apartment and step through the portal into the Level 1 lobby. Every weapon is something you'd find in a building, and most of them double as renovation tools.

## Scope
| # | Item | Ref |
|---|---|---|
| 1 | **Apartment:** a tiny real-world room (floor 0) with the home bed, your stash and the portal to Level 1's lobby. It is the respawn point. | D23, D51 |
| 2 | **Intro:** a short, skippable opening on a new game | D4 |
| 3 | **Dual-use tools:** weapons that also renovate, spending durability only on renovation | D35, D40 |
| 4 | **Content retheme:** names, descriptions, sprites and palettes for enemies, items, furniture, obstacles and surfaces (table below) | D4 |
| 5 | **Asset audit and art pipeline** | |
| 6 | **Terminology:** Floor becomes **Level**, gold becomes **cash** ($), the dungeon becomes the Backrooms | D4 |

**Deferred:**
- **Apartment rent and debt (D8):** to P5. Rent needs the economy that tenants bring, and an apartment with no income to pay it would be pure punishment.
- **Real-world purchases (P10).**

---

## 1. The apartment (floor 0)
- **Floor 0** is a one-room "real world" floor: a new `apartment` template, tagged `home`. It is never expanded and has no doors.
  - It holds the **home bed**, the **stash** (the storage chest with your starting kit), a couple of shabby furniture pieces, and a **portal**.
  - The portal is a fixed furniture piece with `use: { id: 'portal' }`, the same mechanism as the elevator. Because it's a click and not a tile trigger, you never step into it by accident while carrying furniture.
- **Going through the portal:**
  - It goes **Apartment ↔ Level 1 lobby**, costing one screen transition (15 min).
  - Level 1's lobby gets a matching return portal next to the elevator.
- **Level 1's lobby** stops being the safe room. It's a plain lobby: elevator, portal back, stairs-free. The `safe` tag and the home bed move to the apartment.
- **What the apartment is:**
  - Always secure (`isSecure` returns true for `home`).
  - Never part of the estate.
  - Not on the map. The phone map shows "Apartment" when you're there.
  - It can still be furnished and renovated: it's yours.
- **Respawn:** you respawn in the apartment. Passing out at 2 AM wakes you there.
- **Migration (schema v6):** existing saves get a floor 0 apartment.
  - The home bed and the stash chest (with their contents) **move** from the old safe room to the apartment.
  - The old safe room keeps its other furniture and becomes a plain lobby with a return portal.

## 2. Intro
- On a brand-new world, **the phone opens with a short text thread**, about four messages from the landlord and an unknown number, setting up the premise. The player is standing in the apartment, and a glowing crack in the closet wall is the portal.
- It's skippable (the close button) and stays in the phone's Messages afterwards.
- There are no cutscene screens, which keeps the minimal-GUI rule (Q3).

## 3. Dual-use tools
- **Data:** a `WeaponDef` can carry a `tool: { action: BehaviorRef; uses: number }`. Its instance keeps `data.count` for renovation uses, the same as tools today.
  - **Attacking never spends uses** (D40).
  - **Renovating does.** At 0 uses the item stays a weapon but can't renovate any more, until you refill it with a kit of the same tool kind (stacking rule).
- **Input (Q2): context-sensitive.** In a room you own with no living enemies, left click renovates the outlined tile. Anywhere else it attacks. No new inputs are needed.
  - **Revised (2026-10):** the room deciding was unintuitive and went wrong at doorways with monsters just through them. A click now always attacks; holding the button on a workable tile for half a second renovates it, anywhere, monsters or not. Landing a hit starts the hold over, and moving to another tile with the button still down starts on that one.
- **Pure tools** (plywood, drywall kit, rolls) stay non-weapons.

## 4. Retheme table (proposal: edit freely)
Behaviours stay the same; only names, sprites and palettes change unless noted.

**Enemies**
| Now | Becomes | Notes |
|---|---|---|
| rat | Rat | They're real Backrooms rats. |
| bat | Ceiling Moth | Erratic flyer |
| slime | Damp Blob | Hops; a moist-carpet creature |
| skeleton | Mannequin | Summoned by the boss |
| goblin | Intern | Grid-step chaser |
| skeleton_archer | Stapler Clerk | Keeps its distance and shoots staples |
| wisp | Flicker | A sentient fluorescent tube; bobs and shoots |
| bog_crab | Water Cooler | Keeps away and lobs water |
| cultist | HR Representative | Teleports and shoots memos |
| knight | Security Guard | Charges |
| **bone_warden** (boss) | **The Facility Manager** | Summons mannequins |

**Weapons (all dual-use unless marked)**
| Now | Becomes | Renovation use |
|---|---|---|
| short_sword *(starter)* | Crowbar | Pry: demolish short walls and fixtures |
| dagger | Box Cutter | none (weapon only) |
| mace | Pipe Wrench | none |
| broadsword | Sledgehammer | Demolish (tall walls too) |
| battle_axe | Fire Axe | Demolish |
| spear | Push Broom | none (long reach) |
| shortbow | Nail Gun | Build plank patches (fill holes). Revised 2026-10: mends barricades instead, 10 durability a use |
| crossbow | Rivet Gun | none |
| fire_wand | Blowtorch | none |
| frost_staff | Fire Extinguisher | none (slowing) |
| alchemist_flask | Cleaning Spray | none (lobbed) |
| hammer *(tool)* | Claw Hammer | Becomes dual-use: demolish plus a light melee |

**Armor:** leather becomes Hoodie, chainmail becomes Hi-Vis Vest, plate becomes Riot Vest.

**Passives:**
| Now | Becomes |
|---|---|
| swift_boots | Running Shoes |
| whetstone | Duct Tape |
| fletching | Precision Bits |
| quickdraw | Work Gloves |
| heart_container | Energy Drink |
| twin_shot | Double Nozzle |
| long_reach | Extension Pole |

**Tools:** plank_bundle becomes Plywood; plaster_kit becomes Drywall Kit; wood_kit becomes Stud Kit.

**Pickups:** gold becomes Cash ($). heart / heart_half become Sandwich / Half Sandwich (heals). Health still shows as hearts.

**Furniture:**
| Now | Becomes |
|---|---|
| brazier | Space Heater |
| torch_stand | Work Light |
| candelabra | Desk Lamp |
| storage_chest | Storage Box |
| piano | Upright Piano |

The rest (chair, table, sofa, bed, plants…) already fit.

**Obstacles:**
| Now | Becomes |
|---|---|
| stone walls | Concrete |
| plaster | Drywall |
| holes | Missing Floor |
| spikes | Broken Glass |

**Surfaces:** a new default for Backrooms rooms: **yellow wallpaper** walls and **damp beige carpet** floors. These are *template-level defaults resolved at render time* (`RoomLayout.floorSurfaceAt` / `wallSurfaceAt`), not stored per tile, so saves don't grow. Templates may override them (`floorSurface`, `wallSurface`). Existing rolls keep their names.

**Ids stay unchanged.** Only display data changes, so saves need no item migration.

## 5. Asset audit and art pipeline
- **What we have:**
  - Kenney *Tiny Dungeon*: fantasy characters, weapons, chests.
  - Kenney *Roguelike Indoors*: modern furniture, which mostly fits already.
  - Placeholder wall sheets (`scripts/wall-placeholders.mjs`).
  - Procedural sprites (`engine/procedural.ts`).
- **What the theme needs that we don't have:**
  - modern characters (the player, the enemies above)
  - tool and weapon icons
  - the yellow-wallpaper and concrete wall sets
  - the portal, the apartment look
  - (later) NPCs

  **Q1: placeholders only.** The art will be replaced later, so P2 delivers the code and mechanics with placeholder visuals: existing sprites, recolours and procedural drawings.
- **Pipeline:** the asset prefixes stay as they are (`td:`, `ri:`, `proc:`, `auto:`). A new prefix can be added for any new sheet (e.g. `rc:` for Kenney *Roguelike Characters*, `px:` for a custom sheet), registered in `engine/assets.ts` with its grid layout.

## 6. Terminology
- UI text: "Floor N" becomes "Level N", "Room claimed!" becomes "Property acquired!", gold becomes $.
- Banners: "Deeper into the dungeon…" becomes "Deeper into the Backrooms…".
- README intro and the CLAUDE.md summary.
- Code identifiers stay (`floor`, `gold`). This is display text only.

---

## Files (main)
- **Shared:**
  - `content/**` (names, descriptions, sprites)
  - new `content/roomTemplates/apartment.ts` and `content/furniture/portal.ts`
  - `content/types.ts` (`WeaponDef.tool`, the `home` room tag)
  - `world/generator.ts` (floor 0)
  - `world/ownership.ts` (`isSecure` for home)
  - `world/newWorld.ts` (spawn in the apartment, intro messages)
  - `save/schema.ts` (v6)
- **Client:**
  - `game/Game.ts` (portal travel, respawn, home detection)
  - `game/entities/Player.ts` (dual-use input)
  - `game/actions/furnitureUses.ts` (portal)
  - `engine/assets.ts`, `engine/procedural.ts`
  - `ui/*` (text), `ui/MapView.ts` (floor 0)
  - `public/assets/**`, `scripts/wall-placeholders.mjs`

## Verification
- **Unit tests:**
  - the apartment exists on new worlds and v5 saves migrate into it, with the bed and stash moved and contents kept
  - the portal pairs work
  - renovating with a dual-use tool spends uses but attacking doesn't
- **Manual:**
  - New game: the intro thread, then walk through the portal and back.
  - Sleep in the apartment bed.
  - Die and respawn in the apartment.
  - Crowbar: fight with it, then pry a wall in an owned room.
  - Every enemy, item and furniture piece renders, with no blank sprites.

## Decisions (P2)
- **Q1:** placeholder art only. The focus is code and mechanics.
- **Q2:** dual-use tools are context-sensitive: renovate in an owned room with no living enemies, attack otherwise.
- **Q3:** the intro is a phone text thread that opens on a new game.
- **Q4 (decided without asking):** in P2 the apartment holds only the home bed, the stash, the portal and some shabby furniture.
- **Portal travel** costs one screen transition (15 min), like the elevator.
