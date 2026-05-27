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
)

const anthropicAPIURL = "https://api.anthropic.com/v1/messages"
const anthropicModel = "claude-haiku-4-5-20251001"

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

// GenerateWorkflowWithAI converts a natural language description into a DAG using Claude.
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

func callClaudeForDAG(apiKey, description string) (map[string]interface{}, error) {
	reqBody := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: 1024,
		System:    dagSystemPrompt,
		Messages: []anthropicMessage{
			{Role: "user", Content: description},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", anthropicAPIURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var anthropicResp anthropicResponse
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if anthropicResp.Error != nil {
		return nil, fmt.Errorf("Anthropic API error: %s", anthropicResp.Error.Message)
	}

	if len(anthropicResp.Content) == 0 {
		return nil, fmt.Errorf("empty response from AI")
	}

	// Extract JSON from the response text, stripping any markdown code fences
	// Claude sometimes wraps output in ```json ... ``` despite being told not to.
	text := strings.TrimSpace(anthropicResp.Content[0].Text)
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
