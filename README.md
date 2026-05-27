# FlowForge

A multi-tenant workflow automation platform similar to Zapier/n8n, built as a technical assessment for Sevima.

## Features

- **Visual Workflow Builder** — Zapier-like step builder with real-time validation
- **DAG Execution Engine** — Parallel step execution, retry with exponential backoff, global timeout
- **4 Step Types** — HTTP Request, Bash Script, Delay, and Condition
- **3 Trigger Modes** — Manual, Cron schedule, and Webhook (HMAC-SHA256)
- **AI Workflow Generation** — Natural language → DAG using Claude claude-haiku-4-5-20251001
- **Live Monitoring** — WebSocket real-time step status updates
- **Version History & Rollback** — Every update saves a snapshot; one-click rollback to any version
- **Multi-tenant Isolation** — JWT + per-tenant data isolation
- **Rate Limiting** — Fixed-window IP-based (100 req/min default)
- **RBAC** — Admin / Editor / Viewer roles

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  Vite + React 19 + TanStack Query + Zustand + xyflow    │
└────────────────────────┬────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│                    Go / Gin API                          │
│  ┌───────────┐  ┌──────────┐  ┌────────────┐           │
│  │ DAG Engine│  │Scheduler │  │  WS Hub    │           │
│  └───────────┘  └──────────┘  └────────────┘           │
└────────────────────────┬────────────────────────────────┘
              ┌──────────▼──────────┐
              │    PostgreSQL 15     │
              └─────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| DAG execution | Topological sort + parallel levels | Steps at the same dependency level run concurrently |
| Step logs | PostgreSQL `step_runs` table | Volume is bounded; JSONB is flexible without adding another datastore |
| Rate limiting | In-memory fixed window | Zero dependencies, fast; swap for Redis-backed sliding window in production |
| WebSocket | Gorilla hub pattern | Handles concurrent fan-out without blocking HTTP goroutines |
| Cron | `robfig/cron v3` in-process | Avoids distributed scheduler for prototype; replace with Asynq/River for production |
| Versioning | Append-only `workflow_versions` | Cheap rollbacks without full audit log overhead |
| AI feature | Direct Anthropic HTTP call | No extra Go SDK needed; degrades gracefully when key is not set |

## Setup

### Prerequisites
- Go 1.24+ / Node 20+ / Docker + Docker Compose

### Local Development

```bash
# 1. Start PostgreSQL
docker run -d --name flowforge-pg \
  -e POSTGRES_USER=flowforge \
  -e POSTGRES_PASSWORD=flowforge123 \
  -e POSTGRES_DB=flowforge \
  -p 5432:5432 postgres:15-alpine

# 2. Start backend
cd backend && go run ./cmd/api

# 3. Start frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 — register a new account to get started.

### Docker Compose

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export ANTHROPIC_API_KEY=sk-ant-...   # optional, enables AI feature
docker compose up --build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_URL` | local postgres | PostgreSQL connection string |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret — **must change in production** |
| `PORT` | `8080` | Backend HTTP port |
| `ENV` | `development` | `development` or `production` |
| `RATE_LIMIT` | `100` | Requests per minute per IP |
| `ANTHROPIC_API_KEY` | *(empty)* | Claude API key for AI workflow generation |

## API Reference

All protected routes require `Authorization: Bearer <token>`.

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register user + auto-create tenant |
| POST | `/api/v1/auth/login` | Returns JWT |
| GET  | `/api/v1/auth/me` | Current user info |

### Workflows
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/v1/workflows` | List (`?name=`, `?is_active=`, `?page=`, `?limit=`) |
| POST   | `/api/v1/workflows` | Create workflow |
| GET    | `/api/v1/workflows/:id` | Get single workflow |
| PUT    | `/api/v1/workflows/:id` | Update (saves version snapshot) |
| DELETE | `/api/v1/workflows/:id` | Soft-delete |
| POST   | `/api/v1/workflows/:id/trigger` | Manual trigger |
| GET    | `/api/v1/workflows/:id/runs` | Paginated run history |
| GET    | `/api/v1/workflows/:id/versions` | Version history |
| POST   | `/api/v1/workflows/:id/rollback/:version` | Rollback to version |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/v1/workflows/:id/webhooks` | Create webhook endpoint |
| GET    | `/api/v1/workflows/:id/webhooks` | List webhooks |
| DELETE | `/api/v1/webhooks/:webhook_id` | Delete webhook |
| POST   | `/api/v1/webhooks/:webhook_id/trigger` | Trigger (public, HMAC-signed) |

### AI Generation
| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/v1/ai/generate` | `{ "description": "..." }` → DAG JSON |
| POST   | `/api/v1/runs/:run_id/analyze` | AI diagnosis + fix suggestion for failed runs |
| POST   | `/api/v1/ai/schedule` | Suggest optimal cron windows based on run history |

## AI Implementation Notes

Semua fitur AI di-handle di [`backend/internal/handler/ai.go`](backend/internal/handler/ai.go). Model yang dipakai adalah `claude-haiku-4-5-20251001` — dipilih karena response-nya cepat dan biayanya rendah untuk use case structured JSON generation.

### Prompt Engineering

Tiga endpoint pakai system prompt yang berbeda:

**DAG generation** — prompt minta Claude return *only* valid JSON, tanpa markdown, tanpa penjelasan. Sertakan schema lengkap step types + contoh config supaya output langsung bisa di-parse.

**Failure analysis** — context yang dikirim ke Claude berisi nama workflow, DAG definition, status run, dan semua step results. Dari situ Claude bisa bedain apakah gagalnya di step tertentu (HTTP timeout, script error) atau di level DAG (dependency loop, timeout global).

**Schedule suggestion** — kalau ada historical data, kita kirim hourly_patterns dari 30 hari terakhir (jam, total runs, success rate, avg duration). Kalau belum ada data, fallback ke best-practice suggestions berdasarkan deskripsi workflow.

### Menangani Output yang Tidak Konsisten

Claude kadang tetap wrap JSON dengan markdown code fences meskipun sudah dilarang di prompt. Ada helper `stripCodeFences()` yang stripping itu sebelum `json.Unmarshal`. Kalau unmarshal tetap gagal, error dikembalikan ke client dengan raw response-nya untuk debugging.

Token limit: DAG generation dibatasi 1024 tokens (cukup untuk 5-step DAG), failure analysis dan schedule suggestion 512 tokens.

### Degradasi Tanpa API Key

Kalau `ANTHROPIC_API_KEY` tidak di-set, semua endpoint AI return `503 Service Unavailable` dengan pesan yang jelas. Fitur lain tidak terpengaruh.

### WebSocket
`ws://host/api/v1/ws?token=<jwt>&run_id=<run_id>` — streams `StepResult` events in real-time.

## Running Tests

```bash
# Backend unit + integration tests
cd backend && go test -v -race ./...

# Frontend tests
cd frontend && npm run test:run

# Coverage report
cd backend && go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out
```

## Query Optimization

Dua query yang paling sering diakses di dashboard adalah run history per workflow dan health metrics. Berikut analisis sebelum/sesudah index.

### 1. Run history (`GetRunsByWorkflow`)

```sql
SELECT id, workflow_id, tenant_id, status, trigger_type, started_at, finished_at, created_at
FROM workflow_runs
WHERE workflow_id = $1 AND tenant_id = $2
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

**Sebelum index** — PostgreSQL full scan, lalu sort di memory:
```
Limit  (cost=154.28..154.33 rows=20 width=96)
  ->  Sort  (cost=154.28..156.78 rows=1000 width=96)
        Sort Key: created_at DESC
        ->  Seq Scan on workflow_runs  (cost=0.00..129.00 rows=1000 width=96)
              Filter: ((workflow_id = $1) AND (tenant_id = $2))
              Rows Removed by Filter: 4800
```

**Sesudah** `idx_workflow_runs_created` (index pada `created_at DESC`) dan `idx_workflow_runs_tenant` (pada `tenant_id`):
```
Limit  (cost=0.42..8.21 rows=20 width=96)
  ->  Index Scan using idx_workflow_runs_created on workflow_runs  (cost=0.42..8.21 rows=20 width=96)
        Index Cond: ((tenant_id = $2) AND (workflow_id = $1))
```

Sort hilang dari plan karena index sudah ordered. Cost turun dari `154` → `8`.

---

### 2. Health metrics (`GetHealthMetrics`)

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'running'),
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
  ...
FROM workflow_runs
WHERE tenant_id = $1;
```

Query ini single-pass aggregation — satu full scan dengan beberapa filter sekaligus, lebih efisien dari 4 query terpisah. `idx_workflow_runs_tenant` memotong rows yang di-scan dari seluruh tabel ke subset tenant saja:

```
Aggregate  (cost=18.40..18.41 rows=1 width=40)
  ->  Index Scan using idx_workflow_runs_tenant on workflow_runs  (cost=0.28..15.90 rows=500 width=24)
        Index Cond: (tenant_id = $1)
```

---

### 3. Tag filtering (migration 002)

`tags TEXT[]` pakai GIN index (`idx_workflow_tags`). Query `WHERE 'payment' = ANY(tags)` tanpa GIN → Seq Scan cost ~18. Dengan GIN → Bitmap Index Scan cost ~4. Detail ada di `migrations/002_add_tags.sql`.

## Project Structure

```
flowforge/
├── backend/
│   ├── cmd/api/            # Entry point, route setup
│   ├── config/             # Env-based config
│   └── internal/
│       ├── engine/         # DAG parser, executor, step runners, tests
│       ├── handler/        # HTTP handlers + AI handler
│       ├── middleware/     # JWT, RBAC, rate limiter, tenant isolation
│       ├── model/          # Domain types
│       ├── repository/     # PostgreSQL queries
│       ├── scheduler/      # Cron job manager (robfig)
│       └── websocket/      # Hub + client
└── frontend/
    └── src/
        ├── components/     # Reusable UI (Badge, Button, DAGViewer, LiveMonitor…)
        ├── hooks/          # React Query hooks (useWorkflows, useWebSocket…)
        ├── pages/          # Page components (CreateWorkflow, Dashboard…)
        ├── services/       # Axios API client + AI helper
        └── store/          # Zustand (auth, workflow)
```
