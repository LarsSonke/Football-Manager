# Football Manager Web Game

A full-stack, multiplayer fantasy football manager built with TypeScript. Create a league, draft real players, set tactics, and watch daily match simulations play out — complete with goal timelines, player ratings, xG, possession stats, a live match ticker, and full kit customisation.

---

## Features

### League & Draft
- **Multi-user leagues** — invite friends or fill slots with AI clubs
- **Snake draft** — real-time pick-by-pick with configurable time limit and AI auto-picks
- **Auction draft** — bid on players with a limited budget; highest bidder wins each nomination
- **Fantasy Cup** — optional knockout bracket that runs alongside the league season

### Tactics & Management
- **Tactics system** — formation picker (10 presets + custom), playing style (possession / counter / pressing / low block), pressing intensity, defensive line, and width; drag-and-drop pitch layout with touch support
- **Auto subs** — configure up to 3 automatic substitutions triggered by minute or stamina threshold
- **Staff upgrades** — physio, scout, coach, trainer, marketing (7 tiers each, affect gameplay)
- **Facility upgrades** — stadium, training ground, kit facility, VIP lounge
- **Stat boosts** — spend budget to temporarily boost a player's attribute for N matchdays
- **Transfer market** — list players, make offers via DM, transfer window open/close toggle

### Match Engine
- **Event-based simulation** — 90-minute minute-by-minute loop driven by 37 per-player attributes; possession, shots, xG, cards, and stamina all computed per minute
- **Live match ticker** — real-time WebSocket feed showing goals, cards, and subs as they happen
- **Match reports** — full post-match view with score, goal timeline, stat bars (shots, xG, possession), and per-player ratings
- **Match replay** — replay any completed fixture event-by-event at 1×/2×/4× speed

### Club Identity
- **Logo designer** — full SVG logo builder with shapes, colours, badges, and text
- **Kit designer** — SVG kit renderer with hex colour pickers (5 colour slots), 20+ patterns (stripes, hoops, sash, chevron, halves, gradient, diamond, zigzag, and more), 4 collar styles (round, V-neck, polo, henley), 3 sleeve styles (short, long, short with undershirt)
- **Kit on TOTW** — Team of the Week renders players on a full pitch view (EA FC-style) wearing their club kit with face photo
- **Kit on tactics** — tactics lineup cards show each player's club shirt with their photo above it

### Social & Stats
- **League group chat** — real-time broadcast chat visible to all league members
- **Direct messages** — 1-to-1 messaging with transfer offer integration
- **Club profiles** — rival club pages showing squad, tactic, and form
- **Matchday awards** — MOTM, top scorer, top assist, TOTW after each simulated matchday
- **Stats leaderboard** — season totals for goals, assists, ratings across the league
- **Standings** — live league table with position-change arrows, W/D/L, GF/GA, points
- **Sponsor deals** — sign sponsor missions (play a player, win a match, clean sheet, etc.) for budget rewards

### Platform
- **PWA** — installable on desktop and mobile with offline shell
- **Mobile-responsive** — bottom nav, scaled pitch, touch drag on tactics

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, Zustand, Socket.IO client |
| Backend | Express, TypeScript, Prisma ORM, Socket.IO, node-cron, Zod |
| Database | PostgreSQL 16 |
| Monorepo | npm workspaces |

---

## Project Structure

```
football-webgame/
├── packages/
│   ├── shared/              # Shared types, role-rating formulas, team-phase calculator
│   ├── backend/             # Express API, Prisma schema, simulation engine, scheduler
│   │   ├── prisma/          # schema.prisma, seed scripts
│   │   └── src/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── simulation/  # engine.ts (match sim), cup.ts (knockout bracket)
│   │       ├── scheduler/   # daily matchday cron
│   │       └── middleware/
│   └── frontend/            # React SPA
│       └── src/
│           ├── pages/       # Login, Dashboard, League, Draft, MatchReport, ClubProfile
│           ├── components/  # ClubBadge/LogoMaker, KitSvg, KitDesigner
│           ├── stores/
│           └── api/
├── docker-compose.yml
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) — or an existing PostgreSQL 16 instance

### 1. Clone and install

```bash
git clone https://github.com/LarsSonke/Football-Manager-webgame.git
cd Football-Manager-webgame
npm install
```

### 2. Start the database

```bash
docker-compose up -d
```

### 3. Configure environment

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` and set a strong `JWT_SECRET`.

### 4. Push schema and seed

```bash
# Push schema to the database
npm run db:migrate

# Seed with built-in demo players (~40 players)
npm run db:seed
```

#### Optional — seed with real player data

The real-data seeder reads a CSV of player attributes in the FC26 stat format. Export or obtain a file named `FC26_20250921.csv` (placed in the project root) with at least these columns:

```
name, nationality, club_position, age, potential, overall,
pace, shooting, passing, dribbling, defending, physic,
attacking_crossing, attacking_finishing, attacking_heading_accuracy,
attacking_short_passing, attacking_volleys, skill_dribbling,
skill_curve, skill_fk_accuracy, skill_long_passing, skill_ball_control,
movement_acceleration, movement_sprint_speed, movement_agility,
movement_reactions, movement_balance, power_shot_power, power_jumping,
power_stamina, power_strength, power_long_shots, mentality_aggression,
mentality_interceptions, mentality_positioning, mentality_vision,
mentality_penalties, mentality_composure, defending_marking_awareness,
defending_standing_tackle, defending_sliding_tackle,
goalkeeping_diving, goalkeeping_handling, goalkeeping_kicking,
goalkeeping_positioning, goalkeeping_reflexes, goalkeeping_speed,
weak_foot, skill_moves, height_cm, base_stats, value_eur
```

Then run:

```bash
npm run db:seed-real
```

### 5. Run in development

```bash
npm run dev
```

This starts all three packages concurrently:
- **shared** — TypeScript watch build
- **backend** — Express on `http://localhost:3000`
- **frontend** — Vite dev server on `http://localhost:5173`

---

## How to Play

1. **Register** and create a league (set budget, number of clubs, season length, optional cup)
2. **Share the league** — others can join until slots fill; remaining spots become AI clubs
3. **Start the draft** — snake or auction format; AI clubs pick/bid automatically
4. **Design your club** — use the Logo Maker and Kit Designer to give your club an identity
5. **Set tactics** — pick a formation, assign players, configure playing style, set up auto subs
6. **Simulate** — matches run automatically once per day (configurable UTC time)
7. **Check results** — click any fixture for the full report or hit Replay to watch it unfold
8. **Manage** — upgrade staff and facilities, apply stat boosts, sign sponsor deals, trade players

---

## Simulation Engine

The engine runs a 90-minute loop:

1. **Role ratings** — 12 composite scores (striker finishing, GK shot-stopping, CDM ball-winning, etc.) calculated from 37 raw attributes per player
2. **Team phase scores** — 9 dimensions (attack strength, midfield control, defensive strength, pressing, chance creation, finishing quality, GK quality, set-piece attack/defence) aggregated from role ratings with a condition multiplier (morale × form × fitness × match stamina)
3. **Tactic multipliers** — playing style shifts phase scores (e.g. `pressing` +18% pressing strength, `lowblock` +10% defensive strength)
4. **Per-minute loop** — possession probability from midfield differential; shot probability from attack/defence ratio; xG per chance type (long shot 0.04, regular 0.12, cutback 0.28, one-on-one 0.40); stamina drain based on pressing intensity
5. **Events persisted** — goals (with minute, scorer, assister), yellow/red cards, substitutions, team stats, and per-player ratings written to the database

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all packages in watch mode |
| `npm run build` | Production build |
| `npm run db:migrate` | Push Prisma schema to the database |
| `npm run db:seed` | Seed demo players |
| `npm run db:seed-real` | Seed from CSV (see above) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Drop and recreate the database |
