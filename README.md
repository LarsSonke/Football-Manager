# Football Manager Web Game

A full-stack, multiplayer fantasy football manager built with TypeScript. Create a league, draft real players, set tactics, and watch daily match simulations play out — complete with goal timelines, player ratings, xG, and possession stats.

---

## Features

- **Multi-user leagues** — invite friends or fill slots with AI clubs
- **Snake draft** — real-time pick-by-pick draft with a configurable time limit and AI auto-picks
- **Tactics system** — set formation, playing style (possession / counter / pressing / low block), pressing intensity, defensive line, and width; all sliders feed directly into the simulation
- **Event-based match engine** — 90-minute minute-by-minute loop driven by team phase scores derived from 37 per-player attributes; possession, shots, xG, cards, and stamina drain all computed per minute
- **Match reports** — full post-match view with goal timeline, stat bars, and per-player ratings
- **Squad management** — injury tracking, physio upgrades, position training
- **Standings** — live league table with W/D/L, GF/GA, and points

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
│   ├── shared/          # Shared types, role-rating formulas, team-phase calculator
│   ├── backend/         # Express API, Prisma schema, simulation engine, scheduler
│   │   ├── prisma/      # schema.prisma, seed scripts
│   │   └── src/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── simulation/  # engine.ts — the match simulation core
│   │       └── middleware/
│   └── frontend/        # React SPA
│       └── src/
│           ├── pages/   # Login, Dashboard, League, Draft, MatchReport
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

1. **Register** and create a league (set budget, number of clubs, season length)
2. **Share the league** — others can join until slots fill; remaining spots become AI clubs
3. **Start the draft** — snake-format picks in real time; AI clubs pick automatically if it's their turn
4. **Set tactics** — pick a formation, assign players to positions, choose your playing style and sliders
5. **Simulate** — matches run automatically once per day (configurable UTC time); or trigger them manually during development
6. **Check results** — click any completed fixture to see the full match report

---

## Simulation Engine

The engine runs a 90-minute loop:

1. **Role ratings** — 12 composite scores (striker finishing, GK shot-stopping, CDM ball-winning, etc.) calculated from 37 raw attributes per player
2. **Team phase scores** — 9 dimensions (attack strength, midfield control, defensive strength, pressing, chance creation, finishing quality, GK quality, set-piece attack/defence) aggregated from role ratings with a condition multiplier (morale × form × fitness × match stamina)
3. **Tactic multipliers** — playing style shifts phase scores (e.g. `pressing` +18% pressing strength, `lowblock` +10% defensive strength)
4. **Per-minute loop** — possession probability from midfield differential; shot probability from attack/defence ratio; xG per chance type (long shot 0.04, regular 0.12, cutback 0.28, one-on-one 0.40); stamina drain based on pressing intensity
5. **Events persisted** — goals (with minute, scorer, assister), yellow/red cards, team stats, and per-player ratings written to the database

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
