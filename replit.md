# IA Games Ultimate

## Overview

A dual-product platform: (1) Telegram Mini App for players who label AI data via a consensus mini-game (wallet+nickname login, earn XP/points/TON); (2) Web app for business clients who register to download validated datasets via ads→tokens or direct fee payment. Dark neon gaming aesthetic throughout.

**Tech Stack:** pnpm monorepo · TypeScript · React+Vite · Express 5 · PostgreSQL + Drizzle ORM · Zod · Orval API codegen · TON Connect · Telegram WebApp SDK

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

- **Telegram Mini App** — expand/ready/haptic feedback/MainButton/BackButton via `useTelegram.ts` hooks
- **TON Connect wallet login** — wallet + nickname required for Telegram players
- **Task labeling engine** — image, text, classification tasks with energy system
- **Consensus workflow** — configurable votes/threshold → supervisor_review → admin_review → published
- **Reward ledger** — TON rewards released by admin approval (operator: 0.00001 TON, supervisor: 0.0001 TON)
- **Gamification** — XP, levels (base/pro/expert), streak tracking, daily missions, combos
- **Leaderboard** — daily/weekly/all-time rankings with podium view
- **Dataset catalog** — free, ad-unlocked, and premium datasets with client registration flow
- **Business client portal** — registration, watch-ad token system (anti-bot), dataset unlock/pay
- **Nightly publish** — approved records published via POST /api/datasets/nightly-publish
- **Admin panel** — analytics, bulk task generation (max 1000/batch), dataset management, nightly publish
- **Supervisor dashboard** — review queue for supervisor_review and admin_review stages

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Hero, platform stats, featured datasets, activity feed |
| `/tasks` | Tasks | Label tasks, haptic feedback, TG MainButton, earn points |
| `/leaderboard` | Leaderboard | Rankings podium + full list |
| `/datasets` | Datasets | Dataset catalog with search/filter |
| `/datasets/:id` | DatasetDetail | Dataset info + client registration + download flow |
| `/profile/:id` | Profile | User stats, missions, energy, TON conversion, reward ledger |
| `/admin` | Admin | Platform analytics, task/dataset creation, nightly publish |
| `/supervisor` | Supervisor | Review queue (supervisor_review + admin_review stages) |

## API Routes (Key)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/telegram/validate` | HMAC-SHA256 validation of Telegram initData |
| POST | `/api/clients` | Register/upsert business client |
| POST | `/api/clients/:id/ads/watch` | Watch ad → earn tokens (anti-bot: 15s min, 30s cooldown, 30/day cap) |
| POST | `/api/clients/:clientId/datasets/:datasetId/unlock` | Unlock dataset via tokens or payment |
| POST | `/api/datasets/:id/generate-tasks` | Bulk synthetic task generator (max 1000/batch) |
| POST | `/api/datasets/nightly-publish` | Publish approved datasets records |
| GET | `/api/tasks/review` | Tasks pending supervisor/admin review |
| PATCH | `/api/tasks/:id/supervisor-approve` | Supervisor approves → admin_review |
| PATCH | `/api/tasks/:id/admin-approve` | Admin approves → published + releases TON rewards |
| GET | `/api/users/:id/rewards` | User's TON reward ledger |

## Database Schema (Key Tables)

- `users` — wallet, telegramId, points, XP, energy, level, isAdmin, isSupervisor
- `tasks` — datasetId, reviewStage, consensusCount, requiredVotes, consensusThreshold, rewards
- `datasets` — workflowMode, tokenCost, votesRequired, supervisorId, nightlyPublishedAt
- `task_responses` — answer, isCorrect, rewardTon, rewardStatus
- `clients` — firstName, lastName, email, phone, address, company, tokenBalance, riskScore
- `dataset_access` — clientId, datasetId, method, grantedAt
- `reward_ledger` — userId, taskId, role, amountTon, status

## Telegram Mini App Integration

- `useTelegramInit()` — calls `expand()` + `ready()` + `enableClosingConfirmation()` on mount
- `useTelegramHaptic()` — haptic impact/notification/selection feedback
- `useTelegramMainButton()` — controls Telegram main button for task flow
- `useTelegramBackButton()` — controls Telegram back button
- Backend: `POST /api/auth/telegram/validate` — requires `TELEGRAM_BOT_TOKEN` env variable

## Key Commands

- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push-force` — push DB schema changes

## Config

- Reward rates: 10 pts/task, operator 0.00001 TON, supervisor 0.0001 TON
- Anti-bot ads: 30s cooldown, 30/day cap, ≥15s duration, completionToken ≥8 chars
- Energy: 5 per task | 20 per ad recharge | Daily ad cap: 20
- API at port 8080, proxied through `/api` path prefix
- Env secrets: `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN` (optional, for initData validation)
