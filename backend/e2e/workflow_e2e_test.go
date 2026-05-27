// Package e2e contains end-to-end tests that require a real PostgreSQL database.
// They are skipped automatically when DB_URL is not set (unit test environments).
package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/AnsiMauludina/flowforge/config"
	"github.com/AnsiMauludina/flowforge/internal/handler"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
	"github.com/AnsiMauludina/flowforge/internal/repository"
	"github.com/AnsiMauludina/flowforge/internal/scheduler"
	appWS "github.com/AnsiMauludina/flowforge/internal/websocket"
)

// noopHub satisfies handler.WebSocketHub without a real WS connection.
type noopHub struct{}

func (noopHub) BroadcastToRun(_ string, _ interface{})         {}
func (noopHub) BroadcastRunStatus(_, _, _ string)              {}
func (noopHub) BroadcastRunComplete(_, _ string)               {}

// setupServer builds a real Gin server backed by the test DB and returns it.
func setupServer(t *testing.T, db *repository.DB) *httptest.Server {
	t.Helper()
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		JWTSecret: "e2e-test-secret",
		Env:       "test",
	}

	workflowRepo := repository.NewWorkflowRepository(db)
	webhookRepo := repository.NewWebhookRepository(db)
	userRepo := repository.NewUserRepository(db)

	hub := appWS.NewHub()
	go hub.Run()

	var triggerFn scheduler.TriggerFn
	sched := scheduler.New(func(wf *model.WorkflowDefinition, triggerType string) {
		if triggerFn != nil {
			triggerFn(wf, triggerType)
		}
	}, log.New(io.Discard, "", 0))

	h := handler.NewHandler(workflowRepo, webhookRepo, userRepo, cfg.JWTSecret, hub, sched, cfg)

	triggerFn = func(wf *model.WorkflowDefinition, triggerType string) {
		// not needed for manual trigger test
	}

	r := gin.New()
	r.Use(gin.Recovery())

	jwtMW := appMiddleware.NewJWTMiddleware(appMiddleware.JWTConfig{Secret: cfg.JWTSecret})

	v1 := r.Group("/api/v1")
	v1.POST("/auth/register", h.Register)
	v1.POST("/auth/login", h.Login)

	protected := v1.Group("")
	protected.Use(jwtMW, appMiddleware.TenantIsolation())
	{
		protected.POST("/workflows", h.CreateWorkflow)
		protected.GET("/workflows/:id", h.GetWorkflow)
		protected.POST("/workflows/:id/trigger", h.TriggerWorkflow)
		protected.GET("/workflows/:id/runs", h.GetWorkflowRuns)
		protected.GET("/runs/:run_id/steps", h.GetRunSteps)
	}

	return httptest.NewServer(r)
}

// TestE2E_RegisterCreateTriggerAssert is the single full-flow E2E test:
// register → create workflow → trigger → poll until done → assert step result.
func TestE2E_RegisterCreateTriggerAssert(t *testing.T) {
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		t.Skip("DB_URL not set — skipping E2E test")
	}

	db, err := repository.NewDB(dbURL)
	require.NoError(t, err)
	defer db.Close()

	// Run migrations so schema is ready
	for _, f := range []string{"../migrations/001_init.sql", "../migrations/002_add_tags.sql"} {
		sql, err := os.ReadFile(f)
		require.NoError(t, err, "read migration %s", f)
		require.NoError(t, db.RunMigrations(string(sql)), "run migration %s", f)
	}

	srv := setupServer(t, db)
	defer srv.Close()

	client := &http.Client{Timeout: 30 * time.Second}
	slug := fmt.Sprintf("e2etenant%d", time.Now().UnixMilli())

	// ── 1. Register ──────────────────────────────────────────────────────────
	regBody, _ := json.Marshal(map[string]string{
		"tenant_name": "E2E Org",
		"tenant_slug": slug,
		"email":       "admin@e2e.test",
		"password":    "password123",
		"role":        "admin",
	})
	regResp := doRequest(t, client, "POST", srv.URL+"/api/v1/auth/register", "", regBody)
	require.Equal(t, http.StatusCreated, regResp.code, "register: %s", regResp.body)

	var authData struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(regResp.body, &authData))
	token := authData.Data.Token
	require.NotEmpty(t, token, "expected JWT token after register")

	// ── 2. Create workflow ───────────────────────────────────────────────────
	wfBody, _ := json.Marshal(map[string]interface{}{
		"name":        "E2E Test Workflow",
		"description": "created by e2e test",
		"dag": map[string]interface{}{
			"timeout": 30,
			"steps": []map[string]interface{}{
				{
					"id":           "wait",
					"name":         "Short Wait",
					"type":         "delay",
					"dependencies": []string{},
					"config":       map[string]string{"duration": "50ms"},
				},
			},
		},
	})
	wfResp := doRequest(t, client, "POST", srv.URL+"/api/v1/workflows", token, wfBody)
	require.Equal(t, http.StatusCreated, wfResp.code, "create workflow: %s", wfResp.body)

	var wfData struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wfResp.body, &wfData))
	wfID := wfData.Data.ID
	require.NotEmpty(t, wfID, "expected workflow ID")

	// ── 3. Trigger ───────────────────────────────────────────────────────────
	trigResp := doRequest(t, client, "POST", srv.URL+"/api/v1/workflows/"+wfID+"/trigger", token, nil)
	require.Equal(t, http.StatusAccepted, trigResp.code, "trigger: %s", trigResp.body)

	var trigData struct {
		Data struct {
			RunID string `json:"run_id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(trigResp.body, &trigData))
	runID := trigData.Data.RunID
	require.NotEmpty(t, runID, "expected run_id after trigger")

	// ── 4. Poll until complete (max 15 s) ────────────────────────────────────
	var finalStatus string
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		runsResp := doRequest(t, client, "GET",
			srv.URL+"/api/v1/workflows/"+wfID+"/runs", token, nil)
		require.Equal(t, http.StatusOK, runsResp.code)

		// GetWorkflowRuns returns PaginatedResponse directly (not wrapped in Response.Data)
		var runsData struct {
			Data []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(runsResp.body, &runsData))

		for _, r := range runsData.Data {
			if r.ID == runID {
				finalStatus = r.Status
			}
		}

		if finalStatus == "success" || finalStatus == "failed" || finalStatus == "timeout" {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}

	assert.Equal(t, "success", finalStatus, "expected workflow run to succeed")

	// ── 5. Assert step results ───────────────────────────────────────────────
	stepsResp := doRequest(t, client, "GET",
		srv.URL+"/api/v1/runs/"+runID+"/steps", token, nil)
	require.Equal(t, http.StatusOK, stepsResp.code, "get steps: %s", stepsResp.body)

	var stepsData struct {
		Data []struct {
			StepID string `json:"step_id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(stepsResp.body, &stepsData))
	require.NotEmpty(t, stepsData.Data, "expected at least one step result")

	// Find the final record for the "wait" step (last entry wins)
	var waitStep *struct {
		StepID string `json:"step_id"`
		Status string `json:"status"`
	}
	for i := range stepsData.Data {
		if stepsData.Data[i].StepID == "wait" {
			waitStep = &stepsData.Data[i]
		}
	}
	require.NotNil(t, waitStep, "expected a step result for step 'wait'")
	assert.Equal(t, "success", waitStep.Status)
}

// ── helpers ──────────────────────────────────────────────────────────────────

type httpResult struct {
	code int
	body []byte
}

func doRequest(t *testing.T, client *http.Client, method, url, token string, body []byte) httpResult {
	t.Helper()
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewBuffer(body)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return httpResult{code: resp.StatusCode, body: respBody}
}
