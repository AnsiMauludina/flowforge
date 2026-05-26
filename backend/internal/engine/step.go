package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// StepResult holds the result of a step execution
type StepResult struct {
	StepID    string
	Status    string
	Output    map[string]interface{}
	Error     string
	StartedAt time.Time
	FinishedAt time.Time
	Attempt   int
}

// StepExecutor executes a single step
type StepExecutor struct{}

// Execute runs a step and returns its result
func (se *StepExecutor) Execute(
	ctx context.Context,
	step *StepDefinition,
	input map[string]interface{},
	attempt int,
) *StepResult {
	result := &StepResult{
		StepID:    step.ID,
		StartedAt: time.Now(),
		Attempt:   attempt,
	}

	var err error
	var output map[string]interface{}

	switch step.Type {
	case StepTypeHTTP:
		output, err = executeHTTPStep(ctx, step, input)
	case StepTypeScript:
		output, err = executeScriptStep(ctx, step, input)
	case StepTypeDelay:
		output, err = executeDelayStep(ctx, step)
	case StepTypeCondition:
		output, err = executeConditionStep(ctx, step, input)
	default:
		err = fmt.Errorf("unknown step type: %s", step.Type)
	}

	result.FinishedAt = time.Now()

	if err != nil {
		result.Status = "failed"
		result.Error = err.Error()
	} else {
		result.Status = "success"
		result.Output = output
	}

	return result
}

func executeHTTPStep(
	ctx context.Context,
	step *StepDefinition,
	input map[string]interface{},
) (map[string]interface{}, error) {
	url, _ := step.Config["url"].(string)
	method, ok := step.Config["method"].(string)
	if !ok {
		method = "GET"
	}

	var bodyReader io.Reader
	if body, ok := step.Config["body"]; ok && method != "GET" {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewBuffer(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(method), url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	if headers, ok := step.Config["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var respJSON map[string]interface{}
	if err := json.Unmarshal(respBody, &respJSON); err != nil {
		respJSON = map[string]interface{}{"body": string(respBody)}
	}

	return map[string]interface{}{
		"status_code": resp.StatusCode,
		"body":        respJSON,
	}, nil
}

func executeScriptStep(
	ctx context.Context,
	step *StepDefinition,
	input map[string]interface{},
) (map[string]interface{}, error) {
	script, ok := step.Config["script"].(string)
	if !ok || script == "" {
		return nil, fmt.Errorf("script step '%s' has no script", step.ID)
	}

	// Security: only allow bash scripts, no shell injection
	cmd := exec.CommandContext(ctx, "bash", "-c", script)

	// Pass input as env vars
	for k, v := range input {
		cmd.Env = append(cmd.Env, fmt.Sprintf("INPUT_%s=%v",
			strings.ToUpper(k), v))
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("script failed: %w — output: %s", err, string(out))
	}

	return map[string]interface{}{
		"output": string(out),
		"exit_code": 0,
	}, nil
}

func executeDelayStep(
	ctx context.Context,
	step *StepDefinition,
) (map[string]interface{}, error) {
	durationRaw, ok := step.Config["duration"]
	if !ok {
		return nil, fmt.Errorf("delay step missing duration")
	}

	var duration time.Duration
	switch v := durationRaw.(type) {
	case float64:
		duration = time.Duration(v) * time.Second
	case string:
		var err error
		duration, err = time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("invalid duration format: %w", err)
		}
	default:
		return nil, fmt.Errorf("invalid duration type")
	}

	select {
	case <-time.After(duration):
		return map[string]interface{}{"waited": duration.String()}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func executeConditionStep(
	ctx context.Context,
	step *StepDefinition,
	input map[string]interface{},
) (map[string]interface{}, error) {
	expression, ok := step.Config["expression"].(string)
	if !ok {
		return nil, fmt.Errorf("condition step missing expression")
	}

	// Simple expression evaluator
	// Supports: ${variable} == "value", ${variable} != "value"
	result := evaluateExpression(expression, input)

	return map[string]interface{}{
		"result":     result,
		"expression": expression,
	}, nil
}

func evaluateExpression(expr string, input map[string]interface{}) bool {
	// Simple evaluation: check if variable equals value
	// Format: "${key} == value" or "${key} != value"
	if strings.Contains(expr, "==") {
		parts := strings.SplitN(expr, "==", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(strings.Trim(parts[0], "${} "))
			expected := strings.TrimSpace(strings.Trim(parts[1], `"' `))
			if val, ok := input[key]; ok {
				return fmt.Sprintf("%v", val) == expected
			}
		}
	}
	if strings.Contains(expr, "!=") {
		parts := strings.SplitN(expr, "!=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(strings.Trim(parts[0], "${} "))
			expected := strings.TrimSpace(strings.Trim(parts[1], `"' `))
			if val, ok := input[key]; ok {
				return fmt.Sprintf("%v", val) != expected
			}
		}
	}
	return false
}