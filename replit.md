# IA Games Ultimate

## Overview

A gamified data labeling platform (Telegram mini-app style) where operators complete AI labeling tasks to earn points and TON crypto. Features a dark neon gaming aesthetic with mobile-first design.

**Tech Stack:** pnpm monorepo · TypeScript · React+Vite · Express 5 · PostgreSQL + Drizzle ORM · Zod · Orval API codegen

## Architecture

```
artifacts/
  api-server/       Express 5 API, port 8080 (routed via /api proxy)
  ia-games/         React+Vite frontend, path /
lib/
  api-spec/         OpenAPI YAML spec (source of truth for API)
  api-zod/          Auto-generated Zod schemas from OpenAPI
  api-client-react/ Auto-generated React Query hooks from OpenAPI
  db/               Drizzle ORM schema + migrations
```

## Key Features

- **Task labeling engine** — image, text, classification tasks with energy system
- **Gamification** — XP, levels (base/pro/expert), streak tracking, daily missions
- **Leaderboard** — daily/weekly/all-time rankings with podium view
- **Dataset catalog** — free, ad-unlocked, and premium datasets
- **TON crypto rewards** — convert points (1000 pts = 1 TON)
- **Ad reward system** — watch ads to recharge energy or unlock datasets
- **Admin panel** — platform analytics, create tasks/datasets, user management

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Hero, platform stats, featured datasets, activity feed |
| `/tasks` | Tasks | Label tasks, submit answers, earn points |
| `/leaderboard` | Leaderboard | Rankings podium + full list |
| `/datasets` | Datasets | Dataset catalog with search/filter |
| `/datasets/:id` | DatasetDetail | Dataset info + download flow |
| `/profile/:id` | Profile | User stats, missions, energy, TON conversion |
| `/admin` | Admin | Platform analytics, task/dataset creation |

## Database Seed

- 5 users (AlphaLabeler, DataNinja, CryptoTagger, AIGrinder, NewbieLabeler)
- 8 tasks (3 image, 3 text, 2 classification) - 4 golden tasks
- 8 datasets across NLP, Computer Vision, Healthcare, Finance, E-commerce
- 10 task responses, 7 activity events

## Key Commands

- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Config

- `DEMO_USER_ID = 1` hardcoded (AlphaLabeler) for current user demo
- Conversion rate: 1000 pts = 1 TON
- Energy per task: 5 | Energy per ad: 20 | Daily ad cap: 20
- API at port 8080, proxied through `/api` path prefix
