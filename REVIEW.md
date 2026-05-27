# Code Review — FlowForge

This document is a self-review of the FlowForge codebase, covering design decisions, trade-offs, identified issues, and what I would do differently with more time.

---

## What Works Well

### DAG Engine (`backend/internal/engine/`)

The topological sort + parallel-level execution model is correct and efficient. Running all steps in the same "level" concurrently with `sync.WaitGroup` avoids unnecessary serialization without the complexity of a full goroutine-per-step model that would require a semaphore to bound concurrency.

The retry logic with exponential backoff is implemented correctly with context propagation, so timeouts are respected even during retries.

**Good pattern:** `OnStepUpdate` callback decouples the engine from persistence and WebSocket fan-out.

### Multi-tenant Isolation (`internal/middleware/tenant.go`)

Every protected route goes through `TenantIsolation()` middleware which extracts the tenant ID from the JWT and injects it into the Gin context. All repository queries include `AND tenant_id = $N`, so cross-tenant data leaks are prevented at the SQL level regardless of what the handler does.

### Rate Limiter (`internal/middleware/ratelimit.go`)

The fixed-window implementation is correct and thread-safe. Using `sync.RWMutex` with the `Cleanup` goroutine prevents unbounded map growth. Applied at the `/api/v1` group level, so it covers all REST routes without touching the WebSocket upgrade path (which has its own JWT check).

---

## Issues Found

### 1. Migration Strategy — Not Production-Safe

**File:** `cmd/api/main.go`, `repository/db.go`

```go
// Current: runs the entire SQL file on every startup
migrationSQL, err := os.ReadFile("migrations/001_init.sql")
db.RunMigrations(string(migrationSQL))
```

**Problem:** `CREATE TABLE IF NOT EXISTS` is idempotent, but any future `ALTER TABLE` or `DROP` statement in the same file will run repeatedly. On a production database with live data this is a data-loss risk.

**Fix:** Use `golang-migrate/migrate` or a similar versioned migration runner. Each migration file runs exactly once, tracked in a `schema_migrations` table.

### 2. Script Step — No Sandboxing

**File:** `internal/engine/step.go`

```go
cmd := exec.CommandContext(ctx, "bash", "-c", code)
```

The `code` field comes from user input stored in the database. Any authenticated Editor or Admin can execute arbitrary bash commands on the backend host. In a multi-tenant system this is a critical security issue — one tenant can read another tenant's environment variables, files, or network configuration.

**Fix:** Run scripts inside a Docker container with resource limits (`docker run --rm --memory=128m --cpus=0.5 --network none`), or use a WebAssembly sandbox (e.g., Wazero). For the prototype, at minimum restrict `PATH` and unset sensitive env vars before executing.

### 3. In-Memory Rate Limiter — Not Horizontally Scalable

**File:** `internal/middleware/ratelimit.go`

The rate limiter stores counters in a `sync.Map` in the process's memory. With two or more backend instances behind a load balancer, the effective rate limit per IP doubles (or more). Each instance tracks its own window.

**Fix:** Back the counter with Redis using `INCR` + `EXPIRE` commands. This keeps state consistent across all replicas.

### 4. WebSocket — No Authentication on Upgrade

**File:** `internal/handler/ws.go`

The WebSocket endpoint reads the JWT from a `?token=` query parameter. This is a common pattern for browsers (which cannot send Authorization headers during WebSocket upgrade), but the token is visible in server logs, proxy access logs, and browser history.

**Fix:** Accept the token via a short-lived one-time ticket: issue a `/api/v1/ws-ticket` endpoint that returns a signed token valid for 30 seconds, then validate that ticket on WebSocket connect.

### 5. Cron Scheduler — No Distributed Lock

**File:** `internal/scheduler/scheduler.go`

`robfig/cron` runs in the process. With multiple backend instances, every instance will schedule and fire every cron job. A workflow with `0 9 * * *` will create N run records (one per instance) at 9 AM.

**Fix:** Use PostgreSQL advisory locks or a distributed scheduler like Asynq/River. The simplest portable fix is a `SELECT ... FOR UPDATE SKIP LOCKED` pattern on a `scheduled_jobs` queue table.

### 6. Step Run Output — No Pagination / Size Cap

**File:** `repository/workflow.go` — `GetStepRunsByRunID`

Script steps return `cmd.CombinedOutput()` which is unbounded. A runaway script producing gigabytes of stdout will store it all in a JSONB column. `GetStepRunsByRunID` loads all step runs for a run in one query with no LIMIT.

**Fix:** Truncate output at 64 KB in `step.go`. Add pagination to the step runs endpoint.

---

## What I Would Do With More Time

1. **Versioned migrations** — Replace `RunMigrations` with `golang-migrate`. This is a prerequisite for any production deployment.

2. **Redis-backed rate limiter** — Needed before horizontal scaling. The interface is already clean (`RateLimiter` struct), so swapping the backend requires changing one file.

3. **Script sandboxing** — Either Docker-based execution or WASM (Wazero). The `executeScriptStep` function is already isolated, so adding a container wrapper is a contained change.

4. **E2E tests** — The engine and API have unit and integration tests, but there are no tests that run the full stack (register → create workflow → trigger → assert step results). Playwright or Cypress would cover this.

5. **Structured logging** — Replace `log.Printf` with `slog` (stdlib) + a JSON formatter. This makes log aggregation in ELK/Datadog trivial.

6. **Workflow pause/resume** — The engine can be cancelled via context, but there is no mechanism to pause mid-run and resume later. Useful for long-running workflows that need human approval steps.

7. **DAG cycle detection at create time** — `ParseDAG` does topological sort which implicitly detects cycles, but the error message could be more user-friendly ("Cycle detected: A → B → A").

---

## Trade-off Summary

| Area | Decision Made | Alternative | Why This One |
|------|--------------|-------------|--------------|
| Step logging | PostgreSQL JSONB | Elasticsearch / ClickHouse | Simpler ops; log volume is bounded for the prototype |
| Cron | In-process robfig | Asynq / River | No Redis dependency; acceptable for single-instance |
| Rate limiting | In-memory | Redis INCR | No Redis dependency; acceptable for single-instance |
| Auth | JWT stateless | Session + Redis | No state to replicate; logout handled by short expiry |
| Frontend state | Zustand + React Query | Redux Toolkit | Less boilerplate; React Query owns server state |
