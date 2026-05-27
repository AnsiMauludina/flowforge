#!/usr/bin/env bash
# =============================================================================
# FlowForge — Seed Script
# Creates a demo account + 5 example workflows, then triggers them all.
# Usage:  bash scripts/seed.sh [API_URL]
#         API_URL defaults to http://localhost:8080
# =============================================================================

set -euo pipefail

API="${1:-http://localhost:8080}/api/v1"
BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info()    { echo -e "${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
section() { echo -e "\n${BOLD}$*${RESET}"; }
die()     { echo -e "${RED}✗ $*${RESET}"; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required: $1 is not installed"; }
require_cmd curl
require_cmd jq

# ─── Health check ─────────────────────────────────────────────────────────────
section "1. Checking backend is reachable…"
if ! curl -sf "${API%/api/v1}/health" >/dev/null 2>&1; then
  die "Backend not reachable at ${API%/api/v1}. Start the backend first:\n   cd backend && go run ./cmd/api"
fi
success "Backend is up"

# ─── Register demo account ────────────────────────────────────────────────────
section "2. Registering demo account…"

# Use a timestamp suffix so each run creates a fresh tenant and never conflicts
TS=$(date +%s)
SLUG="demo${TS}"
EMAIL="demo@${SLUG}.com"
PASSWORD="demo1234"

REGISTER_RESP=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_name\": \"Demo Corp (seed)\",
    \"tenant_slug\": \"${SLUG}\",
    \"email\":       \"${EMAIL}\",
    \"password\":    \"${PASSWORD}\",
    \"role\":        \"admin\"
  }")

TOKEN=$(echo "$REGISTER_RESP" | jq -r '.data.token // empty')
[ -z "$TOKEN" ] && die "Registration failed: $(echo "$REGISTER_RESP" | jq -r '.error')"

success "Registered → ${EMAIL} / ${PASSWORD}  (tenant: ${SLUG})"

AUTH=(-H "Authorization: Bearer $TOKEN")

# Helper: create workflow, returns its ID
create_workflow() {
  local payload="$1"
  local resp
  resp=$(curl -sf -X POST "$API/workflows" \
    -H "Content-Type: application/json" \
    "${AUTH[@]}" \
    -d "$payload") || die "Failed to create workflow: $payload"
  echo "$resp" | jq -r '.data.id'
}

# Helper: trigger workflow
trigger_workflow() {
  local id="$1"
  local label="$2"
  local resp
  resp=$(curl -sf -X POST "$API/workflows/$id/trigger" \
    "${AUTH[@]}") || { warn "Trigger failed for $label ($id)"; return; }
  local run_id
  run_id=$(echo "$resp" | jq -r '.data.run_id')
  echo "$run_id"
}

# ─── Workflow 1: Parallel API Health Check ────────────────────────────────────
section "3. Creating workflows…"
info "Workflow 1/5 — Parallel API Health Check"

WF1=$(create_workflow '{
  "name": "API Health Check",
  "description": "Hits two public APIs in parallel, then logs the results. Good demo of parallel step execution.",
  "dag": {
    "steps": [
      {
        "id": "check_jsonplaceholder",
        "name": "Check JSONPlaceholder",
        "type": "http",
        "dependencies": [],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/posts/1",
          "method": "GET"
        }
      },
      {
        "id": "check_httpbin",
        "name": "Check HTTPBin",
        "type": "http",
        "dependencies": [],
        "config": {
          "url": "https://httpbin.org/get",
          "method": "GET"
        }
      },
      {
        "id": "log_results",
        "name": "Log Results",
        "type": "script",
        "dependencies": ["check_jsonplaceholder", "check_httpbin"],
        "config": {
          "code": "echo \"=== Health Check Results ===\"\necho \"Timestamp : $(date -u +%Y-%m-%dT%H:%M:%SZ)\"\necho \"JSONPlaceholder : OK\"\necho \"HTTPBin        : OK\"\necho \"All services operational.\""
        }
      }
    ],
    "timeout": 60
  }
}')
success "Created → $WF1"

# ─── Workflow 2: User Data ETL ────────────────────────────────────────────────
info "Workflow 2/5 — User Data ETL Pipeline"

WF2=$(create_workflow '{
  "name": "User Data ETL Pipeline",
  "description": "Fetches user records, processes them with a script, waits 2 s, then POSTs a summary. Shows http → script → delay → http chain.",
  "dag": {
    "steps": [
      {
        "id": "fetch_users",
        "name": "Fetch Users",
        "type": "http",
        "dependencies": [],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/users",
          "method": "GET"
        }
      },
      {
        "id": "process_users",
        "name": "Process Users",
        "type": "script",
        "dependencies": ["fetch_users"],
        "config": {
          "code": "echo \"Processing user data...\"\nUSER_COUNT=10\necho \"Total users  : $USER_COUNT\"\necho \"Active users : 8\"\necho \"Inactive     : 2\"\necho \"ETL complete at $(date -u +%H:%M:%S)\""
        }
      },
      {
        "id": "cool_down",
        "name": "Cool-down Delay",
        "type": "delay",
        "dependencies": ["process_users"],
        "config": { "duration": "2s" }
      },
      {
        "id": "post_summary",
        "name": "Post ETL Summary",
        "type": "http",
        "dependencies": ["cool_down"],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/posts",
          "method": "POST",
          "headers": { "X-Source": "flowforge" },
          "body": { "title": "ETL Summary", "body": "10 users processed, 8 active", "userId": 1 }
        }
      }
    ],
    "timeout": 120
  }
}')
success "Created → $WF2"

# ─── Workflow 3: Conditional Branch ───────────────────────────────────────────
info "Workflow 3/5 — Conditional Branch"

WF3=$(create_workflow '{
  "name": "Order Status Check",
  "description": "Fetches a todo item, runs a condition check, then branches to success/failure path. Shows condition step usage.",
  "dag": {
    "steps": [
      {
        "id": "fetch_order",
        "name": "Fetch Order",
        "type": "http",
        "dependencies": [],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/todos/1",
          "method": "GET"
        }
      },
      {
        "id": "check_status",
        "name": "Check HTTP Status",
        "type": "condition",
        "dependencies": ["fetch_order"],
        "config": { "expression": "${status} == 200" }
      },
      {
        "id": "handle_success",
        "name": "Handle Success",
        "type": "script",
        "dependencies": ["check_status"],
        "config": {
          "code": "echo \"Order fetched successfully!\"\necho \"Processing order data...\"\necho \"Order ID: 1  Status: completed\""
        }
      }
    ],
    "timeout": 60
  }
}')
success "Created → $WF3"

# ─── Workflow 4: System Report (Script-heavy) ─────────────────────────────────
info "Workflow 4/5 — System Report Generator"

WF4=$(create_workflow '{
  "name": "System Report Generator",
  "description": "Pure script workflow: collect → format → send. Shows multi-step bash scripting.",
  "dag": {
    "steps": [
      {
        "id": "collect_info",
        "name": "Collect System Info",
        "type": "script",
        "dependencies": [],
        "config": {
          "code": "echo \"HOST=$(hostname)\"\necho \"DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)\"\necho \"LOAD=normal\"\necho \"DISK=45%\"\necho \"MEM=62%\""
        }
      },
      {
        "id": "format_report",
        "name": "Format Report",
        "type": "script",
        "dependencies": ["collect_info"],
        "config": {
          "code": "echo \"┌─────────────────────────────┐\"\necho \"│  FlowForge System Report    │\"\necho \"└─────────────────────────────┘\"\necho \"Generated : $(date -u)\"\necho \"Status    : All systems operational\"\necho \"Uptime    : 99.97%\"\necho \"Incidents : 0 active\""
        }
      },
      {
        "id": "send_report",
        "name": "Publish Report",
        "type": "http",
        "dependencies": ["format_report"],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/posts",
          "method": "POST",
          "body": { "title": "System Report", "body": "All systems operational. Uptime 99.97%", "userId": 1 }
        }
      }
    ],
    "timeout": 60
  }
}')
success "Created → $WF4"

# ─── Workflow 5: Cron-Scheduled Daily Digest ──────────────────────────────────
info "Workflow 5/5 — Daily Digest (Cron every minute for demo)"

WF5=$(create_workflow '{
  "name": "Daily Digest (Cron Demo)",
  "description": "Scheduled to run every minute (cron: * * * * *) for demo purposes. In production use 0 8 * * * for 8am daily.",
  "cron_expression": "* * * * *",
  "dag": {
    "steps": [
      {
        "id": "fetch_latest_post",
        "name": "Fetch Latest Post",
        "type": "http",
        "dependencies": [],
        "config": {
          "url": "https://jsonplaceholder.typicode.com/posts?_limit=1",
          "method": "GET"
        }
      },
      {
        "id": "build_digest",
        "name": "Build Digest",
        "type": "script",
        "dependencies": ["fetch_latest_post"],
        "config": {
          "code": "echo \"=== Daily Digest ===\"\necho \"Date   : $(date -u +%Y-%m-%d)\"\necho \"Source : JSONPlaceholder\"\necho \"Posts  : 1 new post fetched\"\necho \"Digest ready.\""
        }
      }
    ],
    "timeout": 30
  }
}')
success "Created → $WF5"

# ─── Trigger all manual workflows ─────────────────────────────────────────────
section "4. Triggering workflows to generate run history…"

for WF_ID in "$WF1" "$WF2" "$WF3" "$WF4"; do
  RUN_ID=$(trigger_workflow "$WF_ID" "$WF_ID")
  success "Triggered → workflow $WF_ID  (run: $RUN_ID)"
done

info "Workflow 5 (Cron Demo) will auto-trigger every minute — no manual trigger needed."

# ─── Create a webhook for WF3 ─────────────────────────────────────────────────
section "5. Creating a webhook for Order Status Check…"

WEBHOOK_RESP=$(curl -sf -X POST "$API/workflows/$WF3/webhooks" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{}') || { warn "Webhook creation skipped"; WEBHOOK_RESP=""; }

if [ -n "$WEBHOOK_RESP" ]; then
  WEBHOOK_ID=$(echo "$WEBHOOK_RESP" | jq -r '.data.id')
  WEBHOOK_SECRET=$(echo "$WEBHOOK_RESP" | jq -r '.data.secret')
  success "Webhook created → ID: $WEBHOOK_ID"
  echo ""
  echo -e "  Trigger it externally with:"
  echo -e "  ${YELLOW}curl -X POST ${API%/api/v1}/api/v1/webhooks/$WEBHOOK_ID/trigger \\${RESET}"
  echo -e "  ${YELLOW}     -H 'Content-Type: application/json' \\${RESET}"
  echo -e "  ${YELLOW}     -H 'X-Flowforge-Signature: <hmac-sha256>' \\${RESET}"
  echo -e "  ${YELLOW}     -d '{\"event\":\"order.updated\"}'${RESET}"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
section "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}Seed complete! Here's what was created:${RESET}"
echo ""
echo -e "  ${BOLD}Account${RESET}"
echo -e "    Email    : ${EMAIL}"
echo -e "    Password : ${PASSWORD}"
echo -e "    Tenant   : ${SLUG}"
echo -e "    Role     : admin"
echo ""
echo -e "  ${BOLD}Workflows${RESET}"
echo -e "    1. API Health Check       → $WF1  (parallel steps)"
echo -e "    2. User Data ETL          → $WF2  (http→script→delay→http)"
echo -e "    3. Order Status Check     → $WF3  (condition branch + webhook)"
echo -e "    4. System Report          → $WF4  (script-heavy)"
echo -e "    5. Daily Digest (cron)    → $WF5  (auto-runs every minute)"
echo ""
echo -e "  ${BOLD}Login at${RESET}  http://localhost:3000"
echo -e "  ${BOLD}API docs${RESET}  see README.md"
echo ""
