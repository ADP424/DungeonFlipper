# P8: Rival realtors

> **Status:** done. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D27, D36, D42).

## Goal
You're not the only one carving up the Backrooms. Realtors set up offices in rooms you've cleared but not yet claimed, and spread from there. They have a temperament:

- **Amiable** ones just compete for space.
- **Competitive** ones undercut your listings and lure your unhappy tenants away.
- **Hostile** ones also send thugs to rob you.

You can deal with them in person (buy and sell rooms, trade furniture and items, make amends) or not: they and their guards fight back, and killing or robbing them wrecks your reputation.

## Decisions (P8)
- **Q1 Arrival:**
  - From day 3, a floor where you own property may get a realtor (up to 2 per floor, the second from day 10).
  - They open an office in a cleared room nobody owns, then claim more of those over time (racing you to them).
- **Q2 Trade (at their office, in person):**
  - Sell them a room or buy one of theirs (furniture included).
  - Buy furniture from their stock (delivered to your apartment overnight).
  - Sell them the item in your hand.
- **Q3 Temperament: Amiable / Competitive / Hostile**, from a hidden relation score (−100…100): hostile at −40 or below, competitive below 0, amiable otherwise.
  - **Amiable:** only claims free cleared rooms.
  - **Competitive:** undercuts your listings, and lures your unhappy tenants (mood < 40).
  - **Hostile:** as competitive, plus thug raids. A raid targets one of your rooms, sends an urgent message, and gives you 2 hours to get there and fight the thugs off. Otherwise they carry off up to 3 pieces of furniture to the realtor's office, where you could steal them back, at a price.
  - **What moves the score:**

    | Event | Relation |
    |---|---|
    | Selling them a room | +20 |
    | Making amends (cash: $15 competitive, $30 hostile) | +25 |
    | Buying one of their rooms | −5 |
    | Desperation (you own 3× their rooms on the floor) | −4 a day |
    | Robbing them | −50 |
    | Attacking them | → hostile |
- **Q4 Undercutting:**
  - An applicant for your listing on their floor may go to a competitive or hostile realtor instead: 35%, minus 10% for each utility your unit has, minus 5% per nice thing (lamp, seat or plant, up to 3).
  - It's off while `TEMP_ALWAYS_APPLY` (testing) is on.
- **Violence and theft:**
  - Realtors (60 HP) and their guards fight back. A realtor with 4+ rooms has 1 guard, 7+ have 2.
  - Attacking any of them turns the whole office on you and makes the realtor hostile.
  - **Reputation:**

    | Event | Reputation |
    |---|---|
    | Assault | −5 |
    | Killing a realtor | −60 (their rooms become free) |
    | Theft: lifting their furniture or emptying their containers | −8 |

## Model
- **Records:**
  - `globals.realtors: Record<id, Realtor { id, name, floor, officeRoomId, relation, cash, since, raid? { roomId, until (absolute minute), thugs } }>`.
  - Commands `realtorSet` / `realtorRemoved`. Rooms change hands with `roomOwned`, and the `realtor_flag` furniture (`claimsRoom`) marks theirs.
- **Daily resolver `realtors` (after tenants):**
  - arrivals and expansion
  - re-barricading their frontier doors (they keep their property secure)
  - desperation
  - poaching
  - rent income
- **Tick resolver:**
  - Hostile realtors start raids (about one a day).
  - Expired raids steal furniture.
- **Undercutting:** in `tenantsDay` when an applicant is rolled.
- **Room prices:** 30 per cell + 6 per point of furniture value + 10 per barricade.
  - They pay you that × 1 (amiable) / 0.85 (competitive) / 0.6 (hostile).
  - You pay them × 1.4.
- **Enemy defs:** `realtor`, `realtor_guard` and `thug`, with `npc: true` so they never appear in monster rosters.

## Client
- **Live NPCs (transient enemies):**
  - In a realtor's office: the realtor and their guards, standing passive until provoked.
  - In a room under a raid while you're there: the raid's remaining thugs. Killing them all ends the raid.
- **Clicking a passive realtor** opens the Realtor panel: temperament, relation, their rooms; Sell a room / Buy a room / Stock / Sell held item / Make amends.
- **Theft detection:** lifting furniture in, or taking items out of a container in, a realtor's room.
- **Map:** realtor rooms are purple, with ◆ on their offices.

## As built
- **Code:**
  - `world/realtors.ts`: records, temperament, prices, `transferRoom`, `undercutBy`, and the daily and tick resolvers.
  - Enemy defs `realtor`, `realtor_guard` and `thug` (`EnemyDef.npc`), and the `realtor_flag` furniture.
  - Client: `Enemy.passive` / `realtorId` / `raidOf`, `Game.syncRealtors` / `provokeRealtor` / `realtorKilled`, theft checks in `liftFurniture` / `setContainer`, `ui/RealtorPanel.ts`, and the map colours.
- **Reputation can now go negative (infamy):** below 0, applicants come less often, down to a fifth as often at −80 (`infamyFactor`). Otherwise killing a realtor on a fresh save would cost nothing.
- **Area rebuilds after a trade or a death are deferred to the end of the update step** (`Game.refreshArea`), since they destroy every live entity and are triggered from inside combat.
- **Provocation is per session:** after a reload, an office starts passive again, but the realtor stays hostile.

## Verification
- **Shared tests:**
  - arrival in cleared free rooms only
  - expansion
  - temperament thresholds
  - room price and transfer
  - poaching only unhappy tenants
  - raids starting and stealing
  - realtor death freeing their rooms
- **Browser:** a realtor appears and claims a room. Trade a room; make amends; a raid's thugs fought off; provoking a realtor's guards.
