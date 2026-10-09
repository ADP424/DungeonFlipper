# P5: Tenants v1

> **Status:** done. All open questions are answered (see Decisions); see *As built* for where the implementation differs from this plan. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D7, D12, D14, D18, D24, D26, D32, D39, D44).

## Goal
Property starts paying. You put up a **For Rent** sign in a furnished space of your estate. Applicants come up from the lobby and look it over. You haggle a rent with them, they move in, and rent lands every morning. Tenants live there, visibly, when you're nearby. They care what the place is like and whether it's safe. They flee breaches, can die if trapped, and leave if things go bad.

## Scope (v1: single tenants, tier 1)
1. **Units (Q1):** any connected stretch of floor in rooms you own, bounded by walls and doorways.
   - Once claimed, the original room boundaries no longer matter: a knocked-through wall merges units.
   - Doorways divide units (interior doors you can place come later).
   - A unit with a **For Rent sign** is listed.
   - On the map, units get thicker borders, and rooms merged through openings draw as one shape. If a room is lost, it reverts to its dungeon room.
2. **Listings and applicants (Q4):** a sign lists a unit, and any number can be listed. Each day a listed unit has about a 50% chance (more for nicer units) of drawing an applicant. Applicants wait 2 days, who walks from the floor's lobby to the unit and waits there. The unit must connect to the lobby through secure rooms (D24).
3. **Valuation:**
   - Each tenant has hidden preferences. They're partially revealed: 1–2 shown on the listing, the rest learned by talking and over time (D32).
   - The unit is scored against them, and the valuation is capped by the tenant's **tier ceiling** (D44). Only tier 1 exists until reputation (P7).
4. **Haggling (Q2):** an offer slider with reactions (happy / hesitant / annoyed). The tenant may counter, walks away after 3 strikes, and over-pushing lowers their starting mood. Their maximum is hidden.
5. **Living there:**
   - Rent is paid on the day tick (D7) and summarised in the digest.
   - A tenant needs **a bed in the unit** (D39 capacity; couples and families come in P7).
   - Tenants are real NPCs in active rooms: they wander their unit and sleep in their bed at night. Off-screen they're abstract (D26).
6. **Trouble:**
   - **Breach rescue (D14):** tenants flee to secure space. Trapped ones die at the end of that day unless you clear the room.
   - Mood falls when the unit is insecure, the lobby path is cut, or the place is damaged. A tenant with low mood or an unaffordable rent leaves.
7. **Your apartment rent (D8, Q3):**
   - The landlord charges a small **weekly** rent that rises slowly.
   - Unpaid rent becomes debt, with escalating notices and finally a comedic repo of some stash items.

## Data
- **Furniture:** `for_rent_sign` (a placeable, liftable sign).
  - Interior door obstacle(s) if Q1 says so.
- **`globals["tenants"]`:** tenant records `{ id, name, tier, prefs: Pref[], revealed: string[], unit: { roomId, signUid } | null, rent, mood, status: 'applicant' | 'living' | 'leaving' | 'dead', since }`.
  - They're world-level, not per room, because tenants move.
- **Commands:**
  - `tenantArrived`
  - `tenantAgreed { id, rent }`
  - `tenantUpdated { id, patch }`
  - `tenantLeft`
  - `tenantDied`
  - `rentPaid { playerId, amount }` (via `playerUpdated`)
- **Resolvers:**
  - **Daily:** applicants for listed units, rent, mood drift, leaving, trapped-tenant deaths, landlord rent if Q3.
  - **Tick:** tenants flee breached units (abstract).
- **Units:** computed, not stored. A flood fill from the sign's tile over the area's floor tiles that stops at walls, doors and interior doors. Openings and knocked-through walls connect.

## Preferences (catalogue v1, to tune)
| Pref | Measured as |
|---|---|
| likes/dislikes a furniture tag | count in the unit: plants, lights, seating, tables, storage, music |
| wallpaper / flooring taste | share of tiles with a given surface family (e.g. "carpet", "wood", "papered walls") |
| roomy vs. cosy | floor tiles per occupant |
| bright vs. dim | light-furniture count per area |
| quiet | distance (in rooms) from the nearest insecure / frontier room |
| tidy | furniture density in range |

Value = tier base rent × (1 + Σ weighted pref scores), clamped to [floor, tier ceiling]. Tier 1 is $3–8/day (to tune against kit prices).

## UI
- **NPCs** are placeholder sprites. Hover for name, status and mood.
- **Clicking a tenant or applicant** opens a small panel: the known preferences (unknown ones show as "?") and the haggling controls. Talking reveals one more preference per day.
- **Phone:** a "Tenants" app lists units, tenants, rents and moods. The digest gains rent and tenant news.

## Decisions (P5)
- **Q1:** a unit is connected owned floor bounded by walls and doorways; room boundaries are forgotten once claimed. Placeable interior doors and formal designations (hallways, shared space) come later. Units get thicker borders on the map.
- **Q2:** haggling is an offer slider with reactions; 3 strikes and they leave.
- **Q3:** your apartment rent starts now: weekly, with debt and repo.
- **Q4:** about a 50% daily applicant chance per listed unit, no listing limit, and applicants wait 2 days.
- **Q5 (applicant odds):** a unit's desirability is, for now, how many unsecured rooms it borders, and bordering uncleared ones is worse. A unit bordering nothing unsecured has a 50% daily chance; each unsecured-but-cleared neighbour costs 8 points and each uncleared one 18, with a 5% floor (`applicantChance`).
- **Signs (decided without asking):** a For Rent sign is an item. Placing it puts liftable furniture down, so you move it like furniture, and clicking it opens or closes the listing. You start with 2, and the Hardware app sells more.

## As built
- **Code:** `world/units.ts` (units by flood fill, `unitStats`, `lobbyConnected`) and `world/tenants.ts` (records, valuation, `haggle`, `applicantChance`, the daily and tick resolvers, the landlord). The client has `entities/TenantNpc.ts`, `ui/TenantPanel.ts`, the phone's Tenants app and the map icons (☺ tenants, $ open listing).
- **Commands:** just two, `tenantSet { tenant }` and `tenantRemoved { id }` (doc `global:tenants`). The planned per-event commands weren't needed: resolvers and the panel write whole records. Rent goes through `playerUpdated`.
- **Records:** `{ id, name, tier, prefs, known (how many prefs are revealed), signUid, floor, status: 'applicant' | 'living', rent, mood, strikes, since, lastTalk?, trapped?, displaced? }`. Leaving or dying removes the record.
- **Shelter rule:** a tenant in an invaded unit flees if an adjacent room has the same owner and no monsters (not "secure": during a breach every neighbour is briefly insecure). Otherwise they're trapped and die at the next day tick unless the unit is cleared. Fled tenants go home when it is.
- **Daily mood:** +4, −20 if insecure, −15 if cut off from the lobby, −5 if monsters are next door, −8 per dollar over their valuation, −10 while displaced. Below 0 they leave.
- **Landlord:** $25 every 7 days, +10% after each payment. Missed payments add debt and a notice; the third notice repossesses 3 random items from the apartment storage box and clears the debt.
- **Tuning note:** a bare tier-1 unit (one bed, nothing else) is worth only about $3–5/day, so early rent barely covers the landlord. Furnishing to their preferences is what raises it.
