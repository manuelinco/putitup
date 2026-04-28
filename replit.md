# PUTITUP — Dual-Product AI Data Platform

## Overview

A dual-product human-in-the-loop AI data platform:
1. **PUTITUP Telegram Mini App** (`ia-games` artifact) — Contributors label AI data, earn 0.00004 TON/task, with interactive anti-bot ad challenges. Telegram Mini App with TON wallet login.
2. **PUTITUP Business Web Platform** (`putitup-business` artifact) — Enterprise clients browse and buy validated datasets. Dark elegant desktop-first design. Plans: Starter €9.99, Business €19.99/mo or €120/yr, Premium (custom).

**Platform name:** PUTITUP everywhere — no "IA Games" references.

**Tech Stack:** pnpm monorepo · TypeScript · React+Vite · Express 5 · PostgreSQL + Drizzle ORM · Zod · Orval API codegen · TON Connect · Telegram WebApp SDK

## Architecture

```
artifacts/
  api-server/           Express 5 API, port via $PORT (proxied via /api)
  ia-games/             React+Vite Telegram Mini App, path /
  putitup-business/     React+Vite Business Web Platform, path /putitup-business/
  mockup-sandbox/       Component Preview Server (canvas/design)
lib/
  api-spec/             OpenAPI YAML spec (source of truth for API)
  api-zod/              Auto-generated Zod schemas from OpenAPI
  api-client-react/     Auto-generated React Query hooks from OpenAPI
  db/                   Drizzle ORM schema + migrations
```

## Mini App (ia-games) — Key Features

- **Telegram Mini App** — expand/ready/haptic feedback/MainButton/BackButton via `useTelegram.ts` hooks
- **TON Connect wallet login** — wallet + nickname required for Telegram players
- **Task labeling engine** — image, text, classification tasks with energy system
- **Ad Challenge component** — `ad-challenge.tsx`: 20s ad, 2 random challenges (dot chase + word pick), anti-bot guard
- **Consensus workflow** — configurable votes/threshold → controller_review → admin_review → published
- **Reward: 0.00004 TON/task** — released by admin approval
- **Gamification** — XP, levels, streak, daily missions, combos
- **Leaderboard** — daily/weekly/all-time rankings
- **Controller dashboard** — review queue (supervisor.tsx exports `function Controller`)
- **Admin panel** — analytics, bulk task generation, dataset management

## Mini App Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Hero, platform stats, featured datasets, activity feed |
| `/tasks` | Tasks | Label tasks, earn rewards, ad challenges |
| `/leaderboard` | Leaderboard | Rankings podium + full list |
| `/profile/:id` | Profile | User stats, missions, energy, TON conversion |
| `/admin` | Admin | Platform analytics, task/dataset creation |
| `/controller` | Controller (supervisor.tsx) | Review queue |

## Business Platform (putitup-business) — Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Landing | Hero, stats, features, how it works, CTA |
| `/catalog` | Catalog | 8 datasets with search/filter by category and tier |
| `/catalog/:id` | DatasetDetail | Schema, quality info, unlock CTA |
| `/pricing` | Pricing | Monthly/yearly toggle, 3 plans (Starter/Business/Premium) |
| `/login` | Login | Email+password form (UI only, not activated) |
| `/register` | Register | Plan selector + form (UI only, not activated) |
| `/dashboard` | Dashboard | Usage stats, recent downloads (demo state) |

## Dataset Tiers (Business Platform)

- **BASIC** — Unlock via 3 interactive ad challenges OR Starter/Business subscription
- **MEDIUM** — Unlock via 5 interactive ad challenges OR Business/Premium subscription
- **PREMIUM** — Contact sales only

## API Routes (Key)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/telegram/validate` | HMAC-SHA256 validation of Telegram initData |
| POST | `/api/clients` | Register/upsert business client |
| POST | `/api/clients/:id/ads/watch` | Watch ad → earn tokens |
| POST | `/api/clients/:clientId/datasets/:datasetId/unlock` | Unlock dataset |
| POST | `/api/datasets/:id/generate-tasks` | Bulk synthetic task generator |
| POST | `/api/datasets/nightly-publish` | Publish approved datasets records |
| GET | `/api/tasks/review` | Tasks pending controller/admin review |
| PATCH | `/api/tasks/:id/supervisor-approve` | Controller approves → admin_review |
| PATCH | `/api/tasks/:id/admin-approve` | Admin approves → published + releases TON |
| GET | `/api/users/:id/rewards` | User's TON reward ledger |

## Database Schema (Key Tables)

- `users` — wallet, telegramId, points, XP, energy, level, isAdmin, isSupervisor
- `tasks` — datasetId, reviewStage, consensusCount, requiredVotes, consensusThreshold, rewards
- `datasets` — workflowMode, tokenCost, votesRequired, supervisorId, nightlyPublishedAt
- `task_responses` — answer, isCorrect, rewardTon, rewardStatus
- `clients` — firstName, lastName, email, phone, address, company, tokenBalance, riskScore
- `dataset_access` — clientId, datasetId, method, grantedAt
- `reward_ledger` — userId, taskId, role, amountTon, status

## Key Commands

- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push-force` — push DB schema changes

## Config

- Reward rates: 0.00004 TON/task
- Anti-bot ads: 30s cooldown, 30/day cap, ≥15s duration, completionToken ≥8 chars
- Energy: 5 per task | 20 per ad recharge | Daily ad cap: 20
- API at $PORT, proxied through `/api` path prefix
- Env secrets: `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN` (optional, for initData validation)
- tonconnect-manifest URL: https://f3aedc66-170e-4732-9471-a75aaa7f9d9f-00-3oe97kn7j303s.spock.replit.dev

## Blocked / Future

- Telegram Bot webhook (needs BOT_TOKEN from user)
- Stripe payment activation (scaffolded only)
- Auth backend activation (login/register UI ready, backend not wired)
