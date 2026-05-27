#!/usr/bin/env bash
# =============================================================================
# FlowForge — AI Feature Demo Seed
#
# Creates two demonstration workflows:
#   1. "Payment Gateway Sync"   — designed to fail → demos Intelligent Failure Analysis
#   2. "Daily Sales Report"     — 30 days of synthetic run history → demos Smart Scheduling
#
# Usage:
#   bash scripts/seed_ai_demo.sh [API_URL] [DB_URL]
#
#   API_URL  defaults to http://localhost:8080
#   DB_URL   defaults to postgresql://flowforge:flowforge@localhost:5432/flowforge
#            (only needed for Smart Scheduling history injection)
# =============================================================================

set -euo pipefail

API="${1:-http://localhost:8080}/api/v1"
DB_URL="${2:-${DATABASE_URL:-postgresql://flowforge:flowforge@localhost:5432/flowforge}}"

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
VIOLET="\033[35m"
RED="\033[31m"
RESET="\033[0m"

info()    { echo -e "${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
section() { echo -e "\n${BOLD}$*${RESET}"; }
die()     { echo -e "${RED}✗ $*${RESET}"; exit 1; }
ai()      { echo -e "${VIOLET}✦ $*${RESET}"; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required: '$1' is not installed"; }
require_cmd curl
require_cmd jq

# ─── Health check ─────────────────────────────────────────────────────────────
section "1. Checking backend is reachable…"
curl -sf "${API%/api/v1}/health" >/dev/null 2>&1 || \
  die "Backend not reachable at ${API%/api/v1}. Start it first:\n   cd backend && go run ./cmd/api"
success "Backend is up"

# ─── Register fresh account ───────────────────────────────────────────────────
section "2. Registering AI demo account…"

TS=$(date +%s)
SLUG="aidemo${TS}"
EMAIL="ai@${SLUG}.com"
PASSWORD="demo1234"

REGISTER_RESP=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_name\": \"AI Demo Corp\",
    \"tenant_slug\": \"${SLUG}\",
    \"email\":       \"${EMAIL}\",
    \"password\":    \"${PASSWORD}\",
    \"role\":        \"admin\"
  }")

TOKEN=$(echo "$REGISTER_RESP" | jq -r '.data.token // empty')
[ -z "$TOKEN" ] && die "Registration failed: $(echo "$REGISTER_RESP" | jq -r '.error')"

TENANT_ID=$(echo "$REGISTER_RESP" | jq -r '.data.user.tenant_id')
success "Registered → ${EMAIL} / ${PASSWORD}  (tenant: ${SLUG}, id: ${TENANT_ID})"

AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── Workflow 1 — Failure Analysis Demo ──────────────────────────────────────
section "3. Creating 'Payment Gateway Sync' (will fail on auth error)…"
ai  "This workflow hits a mock 401 endpoint to simulate an expired API token."
ai  "Once it fails, open it in the app and click '✦ Analyze failure with AI'."

WF_FAIL=$(curl -sf -X POST "$API/workflows" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{
    "name": "Payment Gateway Sync",
    "description": "Verifies the payment API token, then fetches recent transactions and reconciles them with the local ledger.",
    "dag": {
      "steps": [
        {
          "id": "verify_api_token",
          "name": "Verify API Token",
          "type": "http",
          "dependencies": [],
          "config": {
            "url": "https://httpstat.us/401",
            "method": "GET",
            "headers": { "Authorization": "Bearer expired_token_abc123" }
          }
        },
        {
          "id": "fetch_transactions",
          "name": "Fetch Recent Transactions",
          "type": "http",
          "dependencies": ["verify_api_token"],
          "config": {
            "url": "https://httpstat.us/200",
            "method": "GET"
          }
        },
        {
          "id": "reconcile_ledger",
          "name": "Reconcile Ledger",
          "type": "script",
          "dependencies": ["fetch_transactions"],
          "config": {
            "code": "echo \"Reconciling $(date +%Y-%m-%d) transactions...\"\necho \"Matched   : 142 records\"\necho \"Unmatched :   3 records\"\necho \"Reconciliation complete.\""
          }
        }
      ],
      "timeout": 30
    }
  }') || die "Failed to create failing workflow"

WF_FAIL_ID=$(echo "$WF_FAIL" | jq -r '.data.id')
success "Created → ${WF_FAIL_ID}"

# Trigger it (it will fail — that's expected)
info "Triggering run (expecting failure due to 401)…"
TRIGGER_RESP=$(curl -sf -X POST "$API/workflows/${WF_FAIL_ID}/trigger" "${AUTH[@]}") || \
  die "Trigger failed"
RUN_ID=$(echo "$TRIGGER_RESP" | jq -r '.data.run_id')
success "Run started → ${RUN_ID} (will fail in ~3s)"

info "Waiting 8s for run to complete…"
sleep 8

# ─── Workflow 2 — Smart Scheduling Demo ──────────────────────────────────────
section "4. Creating 'Daily Sales Report' (scheduling demo)…"
ai  "This workflow will get 30 days of synthetic run history injected into the DB."
ai  "Pattern: low failure at 2-3 UTC, high failure at 14 UTC → AI should prefer early morning."

WF_SCHED=$(curl -sf -X POST "$API/workflows" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{
    "name": "Daily Sales Report",
    "description": "Fetches sales data from the CRM, generates a PDF report, and distributes it to the team via email. Run daily.",
    "dag": {
      "steps": [
        {
          "id": "fetch_sales_data",
          "name": "Fetch Sales Data",
          "type": "http",
          "dependencies": [],
          "config": {
            "url": "https://jsonplaceholder.typicode.com/posts?_limit=10",
            "method": "GET"
          }
        },
        {
          "id": "generate_report",
          "name": "Generate PDF Report",
          "type": "script",
          "dependencies": ["fetch_sales_data"],
          "config": {
            "code": "echo \"=== Daily Sales Report ===\"\necho \"Date     : $(date -u +%Y-%m-%d)\"\necho \"Revenue  : $45,231\"\necho \"Orders   : 312\"\necho \"Avg size : $145\"\necho \"Report generated successfully.\""
          }
        },
        {
          "id": "send_report",
          "name": "Send Report Email",
          "type": "http",
          "dependencies": ["generate_report"],
          "config": {
            "url": "https://jsonplaceholder.typicode.com/posts",
            "method": "POST",
            "body": { "title": "Daily Sales Report", "body": "See attached PDF", "userId": 1 }
          }
        }
      ],
      "timeout": 60
    }
  }') || die "Failed to create scheduling workflow"

WF_SCHED_ID=$(echo "$WF_SCHED" | jq -r '.data.id')
success "Created → ${WF_SCHED_ID}"

# ─── Inject 30 days of historical run data ────────────────────────────────────
section "5. Injecting 30 days of synthetic run history via SQL…"
ai  "Pattern being injected:"
ai  "  02:00 UTC — 28/30 successful (avg 48s)  → optimal window"
ai  "  09:00 UTC — 18/25 successful (avg 95s)  → moderate load"
ai  "  14:00 UTC —  4/12 successful (avg 30s)  → high failure rate (peak load)"
ai  "  22:00 UTC — 20/22 successful (avg 55s)  → good off-peak window"

if ! command -v psql >/dev/null 2>&1; then
  warn "psql not found — skipping historical data injection."
  warn "Install postgresql-client and re-run, or inject manually with:"
  warn "  psql \"\$DATABASE_URL\" -f scripts/seed_ai_history.sql"
else
  psql "$DB_URL" <<SQL
DO \$\$
DECLARE
  v_wf_id    uuid := '${WF_SCHED_ID}';
  v_tenant   uuid := '${TENANT_ID}';
  v_run_id   uuid;
  v_day      int;
  v_start    timestamp with time zone;
  v_dur      float;
  v_status   text;
BEGIN

  FOR v_day IN 1..30 LOOP

    -- ── 02:00 UTC — optimal window (high success, fast) ──────────────────────
    v_start  := NOW() - (v_day || ' days')::interval
                       + interval '2 hours'
                       + ((random()*30)::int || ' minutes')::interval;
    v_dur    := 40 + random() * 20;
    v_status := CASE WHEN random() < 0.93 THEN 'success' ELSE 'failed' END;
    v_run_id := gen_random_uuid();
    INSERT INTO workflow_runs
      (id, workflow_id, tenant_id, status, trigger_type, started_at, finished_at, created_at)
    VALUES (v_run_id, v_wf_id, v_tenant, v_status, 'scheduled',
            v_start, v_start + (v_dur || ' seconds')::interval, v_start);
    IF v_status = 'success' THEN
      INSERT INTO step_runs (id, run_id, step_id, step_name, status, attempt, created_at)
      VALUES (gen_random_uuid(), v_run_id, 'fetch_sales_data', 'Fetch Sales Data', 'success', 1, v_start),
             (gen_random_uuid(), v_run_id, 'generate_report',  'Generate PDF Report', 'success', 1, v_start),
             (gen_random_uuid(), v_run_id, 'send_report',      'Send Report Email',   'success', 1, v_start);
    ELSE
      INSERT INTO step_runs (id, run_id, step_id, step_name, status, attempt, error, created_at)
      VALUES (gen_random_uuid(), v_run_id, 'fetch_sales_data', 'Fetch Sales Data', 'failed', 1,
              'Connection timeout after 30s', v_start);
    END IF;

    -- ── 09:00 UTC — morning load (moderate success) ───────────────────────────
    IF random() < 0.83 THEN  -- ~25 out of 30 days
      v_start  := NOW() - (v_day || ' days')::interval
                         + interval '9 hours'
                         + ((random()*45)::int || ' minutes')::interval;
      v_dur    := 80 + random() * 40;
      v_status := CASE WHEN random() < 0.72 THEN 'success' ELSE 'failed' END;
      v_run_id := gen_random_uuid();
      INSERT INTO workflow_runs
        (id, workflow_id, tenant_id, status, trigger_type, started_at, finished_at, created_at)
      VALUES (v_run_id, v_wf_id, v_tenant, v_status, 'manual',
              v_start, v_start + (v_dur || ' seconds')::interval, v_start);
    END IF;

    -- ── 14:00 UTC — peak load (high failure, slow) ────────────────────────────
    IF random() < 0.40 THEN  -- ~12 out of 30 days
      v_start  := NOW() - (v_day || ' days')::interval
                         + interval '14 hours'
                         + ((random()*60)::int || ' minutes')::interval;
      v_dur    := 20 + random() * 25;
      v_status := CASE WHEN random() < 0.33 THEN 'success' ELSE 'failed' END;
      v_run_id := gen_random_uuid();
      INSERT INTO workflow_runs
        (id, workflow_id, tenant_id, status, trigger_type, started_at, finished_at, created_at)
      VALUES (v_run_id, v_wf_id, v_tenant, v_status, 'manual',
              v_start, v_start + (v_dur || ' seconds')::interval, v_start);
    END IF;

    -- ── 22:00 UTC — late evening (good off-peak) ──────────────────────────────
    IF random() < 0.73 THEN  -- ~22 out of 30 days
      v_start  := NOW() - (v_day || ' days')::interval
                         + interval '22 hours'
                         + ((random()*30)::int || ' minutes')::interval;
      v_dur    := 50 + random() * 20;
      v_status := CASE WHEN random() < 0.91 THEN 'success' ELSE 'failed' END;
      v_run_id := gen_random_uuid();
      INSERT INTO workflow_runs
        (id, workflow_id, tenant_id, status, trigger_type, started_at, finished_at, created_at)
      VALUES (v_run_id, v_wf_id, v_tenant, v_status, 'scheduled',
              v_start, v_start + (v_dur || ' seconds')::interval, v_start);
    END IF;

  END LOOP;

  RAISE NOTICE 'Injected 30-day run history for workflow %', v_wf_id;
END;
\$\$;
SQL
  success "Historical run data injected"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
section "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}AI Demo seed complete!${RESET}"
echo ""
echo -e "  ${BOLD}Account${RESET}"
echo -e "    Email    : ${EMAIL}"
echo -e "    Password : ${PASSWORD}"
echo -e "    Login at : http://localhost:3000"
echo ""
echo -e "  ${BOLD}${VIOLET}✦ Demo 1 — Intelligent Failure Analysis${RESET}"
echo -e "    Workflow : Payment Gateway Sync"
echo -e "    ID       : ${WF_FAIL_ID}"
echo -e "    Steps:"
echo -e "      1. Open  http://localhost:3000/workflows/${WF_FAIL_ID}"
echo -e "      2. Click 'Trigger Run' — the run will fail (401 auth error)"
echo -e "      3. In Live Monitor, click '${VIOLET}✦ Analyze failure with AI${RESET}'"
echo -e "      4. Claude diagnoses the expired token and suggests a fix"
echo ""
echo -e "  ${BOLD}${VIOLET}✦ Demo 2 — Smart Scheduling${RESET}"
echo -e "    Workflow : Daily Sales Report"
echo -e "    ID       : ${WF_SCHED_ID}"
echo -e "    History  : 30 days injected (peak failures at 14:00 UTC, optimal at 02:00 UTC)"
echo -e "    Steps:"
echo -e "      1. Open  http://localhost:3000/workflows/new  (or edit any workflow)"
echo -e "      2. Select 'Scheduled' trigger"
echo -e "      3. Click '${VIOLET}✨ AI Suggest${RESET}' — pass workflow ID for history-based suggestions:"
echo -e "         workflow_id = ${WF_SCHED_ID}"
echo -e "      4. Claude recommends 02:00 UTC or 22:00 UTC, avoids 14:00 UTC"
echo ""
echo -e "  ${YELLOW}Note: ANTHROPIC_API_KEY must be set in .env for AI features to work.${RESET}"
echo ""
