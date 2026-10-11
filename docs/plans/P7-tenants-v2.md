# P7: Tenants v2

> **Status:** done. Roadmap: [../ROADMAP.md](../ROADMAP.md) (D20, D26, D39, D44).

## Goal
Renting grows up. Couples and families move in (if you have the beds), tenants make a mess, monsters make a worse one, and you either mop it up or hire a cleaner. A handyman keeps the pipes and barricades in shape. Unhappy tenants complain, stop paying, and can be evicted, fairly or not. All of it feeds your **reputation**, whose tiers bring wealthier tenants who pay far more and expect more.

## Decisions (P7)
- **Q1 Households need sleeping spots.**
  - A bed sleeps 1, and the new double bed sleeps 2.
  - Households are 60% singles, 25% couples, 15% families of 3–4. A family also needs at least 2 beds.
  - There's one household per unit.
- **Q2 Staff: cleaner and handyman.**
  - Hired from the phone, paid a daily wage.
  - They work off-screen at the day's end and live when you're nearby (D26).
- **Q3 Eviction is a 3-day notice.**
  - It's fair if they're behind on rent or miserable (mood < 30). A fair eviction costs no reputation; evicting anyone else does.
  - You can cancel a notice.
- **Q4 Mess comes from tenants and monsters.**
  - Each household member drops a bit of mess in their unit daily.
  - Monsters leave mess where they spill in and where they die.
  - Mess lowers mood and valuation. You clean it with a mop, or a cleaner does.
- **Decided without asking:**
  - Tenants leave with their own belongings; the furniture is always yours.
  - The reputation numbers below are a first pass, to tune.

## Model
- **Tenant record:** `size` (1–4) and `members` (names).
  - `arrears`: rent withheld while their mood is below 25; paying resumes when they cheer up, and arrears make an eviction fair.
  - `evictDay` / `evictFair`.
  - `complaint { issue, since }`, where issue is `mess`, `power`, `water` or `insecure`.
  - **Valuation:** × 1 / 1.6 / 2.2 / 2.6 by household size, the tier ceiling scaled the same way, and × (1 − 4% per messy tile, at most −50%). It's 0 without enough sleeping spots.
- **Mess:** `RoomState.mess: Record<"x,y", 1..3>`.
  - Commands `messAdded` (+1, up to 3) and `messCleared`.
  - `UnitStats.mess` counts messy tiles.
  - Daily mood: −1 per 3 messy tiles, at most −10.
- **Reputation:** `globals["reputation:<player>"] = { points }`, changed by command `reputationAdded { playerId, delta }`.
  - **Tiers:** 1 at 0+, 2 at 40+, 3 at 100+. Applicants come at your tier or below, weighted toward the top one. Tier 2+ tenants have one more preference.
  - **Gains:** +1 a day per household with mood ≥ 60, at most +5 a day.
  - **Losses:**

    | Event | Reputation |
    |---|---|
    | A tenant dies | −25 |
    | Unfair eviction | −10 |
    | Leaving unhappy | −5 |
    | A complaint left 2+ days | −2 a day |
- **Staff:** `globals.staff: Record<id, Staff { id, name, role, wage, floor, since }>`. Commands `staffSet` and `staffRemoved`.
  - **Candidates:** the phone shows 2 per role each day (seeded by day): cleaners $4–6 a day, handymen $6–9.
  - **Daily resolver (before tenants):** pay wages, and anyone you can't pay quits. Then:
    - Cleaners clear up to 15 messy tiles, tenant units first.
    - Handymen fix up to 4 utility faults and top up the 3 most worn barricades by 40% of their tier's HP.
- **Content:**
  - `double_bed` (2×2, sleeps 2, $35); `FurnitureDef.sleeps`, where a bed defaults to 1.
  - `mop` (tool, `clean`, drag to clean, 80 uses, $6).

## Client
- **Mess decals** on the floor: rubbish specks that grow with the level.
- **Mop:** click or drag.
- **Monster deaths:** a dead monster leaves mess.
- **Tenant NPCs:** one per household member, with kids drawn smaller.
- **Tenant panel:**
  - Shows the household, any arrears, and the eviction state.
  - Has an Evict button, which asks for confirmation, and a Cancel eviction button.
- **Phone:**
  - The Tenants app shows your reputation, tier, and the points to the next tier. Contact cards show the household, arrears and any notice.
  - A new **Staff** app lists who you employ (with Let go) and today's candidates (with Hire).
- **Staff NPCs** wander your estate on their floor. A cleaner walks to mess and clears it; a handyman walks to a fault and fixes it.

## As built
- **Code:**
  - `world/reputation.ts`, `world/staff.ts` (candidates, wages, overnight jobs).
  - The tenant changes in `world/tenants.ts`: households, arrears, eviction, complaints, mess generation, reputation, tiered applicants.
  - `messAdded` from spill-ins in `world/securing.ts`.
  - Client: `entities/StaffNpc.ts`, mess decals (`drawMess` in Game), the `clean` tool action, one `TenantNpc` per household member, the Evict / Cancel eviction buttons in the tenant panel, and the phone's Staff app with the reputation header.
- **Tuning:**
  - **Eviction day:** under notice, they leave at the end of `today + NOTICE_DAYS − 1`, so three nights counting tonight.
  - **Mood:** an eviction notice costs 20 at once, then 10 a day.
  - **Staff:** new hires look after the floor you hire them from (Level 1 if you're at home).

## Verification
- **Shared tests:**
  - sleeping-spot requirements
  - household valuation
  - mess commands and mood
  - reputation gains and losses, and tiers gating applicants
  - eviction fair or unfair after 3 days
  - withholding rent
  - staff wages, quitting and jobs
- **Browser:** a couple in a double-bed unit, mess appearing and mopped, hiring a cleaner and watching them clean, evicting with a notice.
