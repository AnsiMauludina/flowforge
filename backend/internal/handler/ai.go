package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
	"github.com/AnsiMauludina/flowforge/internal/repository"
)

const anthropicAPIURL = "https://api.anthropic.com/v1/messages"
const anthropicModel = "claude-haiku-4-5-20251001"

// ─── Anthropic client types ───────────────────────────────────────────────────

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// ─── Response types ───────────────────────────────────────────────────────────

type FailureAnalysis struct {
	Diagnosis    string `json:"diagnosis"`
	SuggestedFix string `json:"suggested_fix"`
}

type ScheduleSuggestion struct {
	Cron   string `json:"cron"`
	Label  string `json:"label"`
	Reason string `json:"reason"`
}

// ─── System prompts ───────────────────────────────────────────────────────────

const dagSystemPrompt = `You are a workflow automation expert for FlowForge (similar to Zapier/n8n).
Convert the user's description into a valid FlowForge DAG JSON.

Return ONLY valid JSON with this exact structure (no markdown, no explanation, no code blocks):
{
  "steps": [
    {
      "id": "snake_case_id",
      "name": "Human Readable Name",
      "type": "http",
      "dependencies": [],
      "config": { "url": "https://api.example.com/endpoint", "method": "GET" }
    }
  ],
  "timeout": 300
}

Step types and their required config keys:
- "http": config must have "url" (string) and optionally "method" (GET/POST/PUT/DELETE), "headers" (object), "body" (object)
- "script": config must have "code" (bash script string, e.g. "echo 'processing...'")
- "delay": config must have "duration" (e.g. "5s", "1m", "30s")
- "condition": config must have "expression" (e.g. "${status} == 200" or "${response.active} == true")

Rules:
- Step IDs: snake_case, unique, no spaces, descriptive (e.g. fetch_users, process_data, send_notification)
- First step must have an empty "dependencies" array []
- Later steps reference prior step IDs in "dependencies"
- Use realistic placeholder URLs and scripts
- Keep it 2-5 steps
- Output ONLY valid JSON, nothing else, no markdown code fences`

const failureAnalysisPrompt = `You are a workflow automation expert. Analyze the failed workflow run data and provide a clear diagnosis and actionable fix.

Return ONLY valid JSON, no markdown, no code blocks:
{
  "diagnosis": "1-2 sentence technical explanation of why it failed",
  "suggested_fix": "Step-by-step actionable fix the user can apply immediately"
}`

const scheduleOptimizationPrompt = `You are a workflow scheduling expert. Suggest 3-5 optimal cron schedule windows based on the provided context.

Return ONLY valid JSON, no markdown, no code blocks:
{
  "suggestions": [
    {
      "cron": "0 9 * * 1-5",
      "label": "Weekday mornings",
      "reason": "Low load window — business hours start with fresh resources"
    }
  ]
}

Rules:
- Standard 5-field cron syntax (minute hour day month weekday)
- If hourly_patterns provided: prefer hours with low failure rate and avoid peak-load hours
- Vary suggestions: include at least one daily, one weekly, and one business-hours option
- Keep reasons concise (max 1 sentence)`

// ─── Handlers ─────────────────────────────────────────────────────────────────

// GenerateWorkflowWithAI converts a natural language description into a DAG.
// POST /api/v1/ai/generate
func (h *Handler) GenerateWorkflowWithAI(c *gin.Context) {
	if h.cfg.AnthropicAPIKey == "" {
		c.JSON(http.StatusServiceUnavailable, Response{
			Error: "AI feature not configured — set ANTHROPIC_API_KEY environment variable",
		})
		return
	}

	var req struct {
		Description string `json:"description" validate:"required,min=10"`
	}
	if !bindAndValidate(c, &req, h.validate) {
		return
	}

	dag, err := callClaudeForDAG(h.cfg.AnthropicAPIKey, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "AI generation failed: " + err.Error()})
		return
	}

	successResponse(c, http.StatusOK, gin.H{"dag": dag})
}

// AnalyzeRunFailure sends a failed run's context to Claude for diagnosis + fix suggestion.
// POST /api/v1/runs/:run_id/analyze
func (h *Handler) AnalyzeRunFailure(c *gin.Context) {
	if h.cfg.AnthropicAPIKey == "" {
		c.JSON(http.StatusServiceUnavailable, Response{
			Error: "AI feature not configured — set ANTHROPIC_API_KEY environment variable",
		})
		return
	}

	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	runID, err := parseUUID(c.Param("run_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid run id"})
		return
	}

	run, err := h.workflowRepo.GetRunByID(c.Request.Context(), runID, tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "run not found"})
		return
	}

	if run.Status != "failed" && run.Status != "timeout" {
		c.JSON(http.StatusBadRequest, Response{Error: "run has not failed — only failed/timeout runs can be analyzed"})
		return
	}

	workflow, err := h.workflowRepo.GetByID(c.Request.Context(), run.WorkflowID, tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to load workflow"})
		return
	}

	steps, err := h.workflowRepo.GetStepRunsByRunID(c.Request.Context(), runID, tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to load step runs"})
		return
	}

	analysis, err := callClaudeForAnalysis(h.cfg.AnthropicAPIKey, workflow.Name, workflow.DAG, run, steps)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "analysis failed: " + err.Error()})
		return
	}

	successResponse(c, http.StatusOK, analysis)
}

// GetScheduleSuggestions uses historical run patterns to suggest optimal cron windows.
// POST /api/v1/ai/schedule
func (h *Handler) GetScheduleSuggestions(c *gin.Context) {
	if h.cfg.AnthropicAPIKey == "" {
		c.JSON(http.StatusServiceUnavailable, Response{
			Error: "AI feature not configured — set ANTHROPIC_API_KEY environment variable",
		})
		return
	}

	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))

	var req struct {
		WorkflowID  string `json:"workflow_id"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid request body"})
		return
	}

	var patterns []repository.HourlyPattern
	if req.WorkflowID != "" {
		wfID, err := parseUUID(req.WorkflowID)
		if err == nil {
			patterns, _ = h.workflowRepo.GetHourlyRunPatterns(c.Request.Context(), wfID, tenantID)
		}
	}

	suggestions, err := callClaudeForSchedule(h.cfg.AnthropicAPIKey, req.Description, patterns)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "schedule suggestion failed: " + err.Error()})
		return
	}

	successResponse(c, http.StatusOK, gin.H{"suggestions": suggestions})
}

// ─── Claude helpers ───────────────────────────────────────────────────────────

func callClaudeForDAG(apiKey, description string) (map[string]interface{}, error) {
	reqBody := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: 1024,
		System:    dagSystemPrompt,
		Messages:  []anthropicMessage{{Role: "user", Content: description}},
	}

	text, err := callClaude(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	// Strip markdown code fences that Claude sometimes adds despite instructions.
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text, "\n"); idx != -1 {
			text = text[idx+1:]
		}
		if idx := strings.LastIndex(text, "```"); idx != -1 {
			text = strings.TrimSpace(text[:idx])
		}
	}

	var dag map[string]interface{}
	if err := json.Unmarshal([]byte(text), &dag); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON — %w\nRaw: %s", err, text)
	}
	return dag, nil
}

func callClaudeForAnalysis(
	apiKey, wfName string,
	dag map[string]interface{},
	run *model.WorkflowRun,
	steps []model.StepRun,
) (*FailureAnalysis, error) {
	context := buildFailureContext(wfName, dag, run, steps)

	reqBody := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: 512,
		System:    failureAnalysisPrompt,
		Messages:  []anthropicMessage{{Role: "user", Content: context}},
	}

	text, err := callClaude(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	text = stripCodeFences(text)

	var result FailureAnalysis
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON — %w\nRaw: %s", err, text)
	}
	return &result, nil
}

func callClaudeForSchedule(apiKey, description string, patterns []repository.HourlyPattern) ([]ScheduleSuggestion, error) {
	context := buildScheduleContext(description, patterns)

	reqBody := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: 512,
		System:    scheduleOptimizationPrompt,
		Messages:  []anthropicMessage{{Role: "user", Content: context}},
	}

	text, err := callClaude(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	text = stripCodeFences(text)

	var result struct {
		Suggestions []ScheduleSuggestion `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON — %w\nRaw: %s", err, text)
	}
	return result.Suggestions, nil
}

// callClaude makes a single POST to the Anthropic Messages API and returns the text content.
func callClaude(apiKey string, reqBody anthropicRequest) (string, error) {
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", anthropicAPIURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var anthropicResp anthropicResponse
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}
	if anthropicResp.Error != nil {
		return "", fmt.Errorf("Anthropic API error: %s", anthropicResp.Error.Message)
	}
	if len(anthropicResp.Content) == 0 {
		return "", fmt.Errorf("empty response from AI")
	}

	return anthropicResp.Content[0].Text, nil
}

// ─── Context builders ─────────────────────────────────────────────────────────

func buildFailureContext(
	wfName string,
	dag map[string]interface{},
	run *model.WorkflowRun,
	steps []model.StepRun,
) string {
	dagJSON, _ := json.MarshalIndent(dag, "", "  ")
	stepsJSON, _ := json.MarshalIndent(steps, "", "  ")
	return fmt.Sprintf(
		"Workflow: %s\nRun status: %s\nTrigger: %s\n\nDAG definition:\n%s\n\nStep execution results:\n%s",
		wfName, run.Status, run.TriggerType, string(dagJSON), string(stepsJSON),
	)
}

func buildScheduleContext(description string, patterns []repository.HourlyPattern) string {
	if len(patterns) == 0 {
		if description == "" {
			description = "a general automation workflow"
		}
		return fmt.Sprintf(
			"Workflow description: %s\n\nNo historical run data available yet. Suggest schedules based on best practices.",
			description,
		)
	}

	patternsJSON, _ := json.MarshalIndent(patterns, "", "  ")

	descPart := ""
	if description != "" {
		descPart = fmt.Sprintf("Workflow description: %s\n\n", description)
	}

	return fmt.Sprintf(
		"%sHistorical run patterns (last 30 days, grouped by UTC hour):\n%s\n\n"+
			"Each entry: hour (0-23 UTC), total runs, successful, failed, avg duration in seconds.",
		descPart, string(patternsJSON),
	)
}

func stripCodeFences(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text, "\n"); idx != -1 {
			text = text[idx+1:]
		}
		if idx := strings.LastIndex(text, "```"); idx != -1 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	return text
}
