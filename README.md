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
