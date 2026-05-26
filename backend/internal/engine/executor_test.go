package engine

import (
	"context"
	"sync"
	"testing"
	"time"
)

// mockStepExecutor untuk testing tanpa real HTTP calls
func makeTestDAG() DAGDefinition {
	return DAGDefinition{
		Timeout: 60,
		Steps: []StepDefinition{
			{
				ID:           "step1",
				Name:         "Step 1",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{},
			},
			{
				ID:           "step2",
				Name:         "Step 2",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"step1"},
			},
			{
				ID:           "step3",
				Name:         "Step 3",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"step1"},
			},
			{
				ID:           "step4",
				Name:         "Step 4",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"step2", "step3"},
			},
		},
	}
}

func TestExecutor_SuccessfulRun(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	def := makeTestDAG()
	ctx := context.Background()

	run, err := executor.Execute(ctx, "run-001", def)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if run.Status != RunStatusSuccess {
		t.Errorf("expected status 'success', got '%s'", run.Status)
	}
	if len(run.StepResults) != 4 {
		t.Errorf("expected 4 step results, got %d", len(run.StepResults))
	}

	// Verify all steps succeeded
	for stepID, result := range run.StepResults {
		if result.Status != "success" {
			t.Errorf("step '%s' expected success, got '%s'", stepID, result.Status)
		}
	}
}

func TestExecutor_StepUpdateCallback(t *testing.T) {
	var mu sync.Mutex
	updates := []*StepResult{}

	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
		OnStepUpdate: func(runID string, result *StepResult) {
			mu.Lock()
			defer mu.Unlock()
			updates = append(updates, result)
		},
	})

	def := DAGDefinition{
		Timeout: 30,
		Steps: []StepDefinition{
			{
				ID:           "step1",
				Name:         "Step 1",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{},
			},
		},
	}

	ctx := context.Background()
	_, err := executor.Execute(ctx, "run-002", def)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	// Should have at least 2 updates: running + success/failed
	if len(updates) < 2 {
		t.Errorf("expected at least 2 step updates, got %d", len(updates))
	}

	// First update should be "running"
	if updates[0].Status != "running" {
		t.Errorf("expected first update to be 'running', got '%s'", updates[0].Status)
	}
}

func TestExecutor_Timeout(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	// Workflow with very short timeout
	def := DAGDefinition{
		Timeout: 1, // 1 second timeout
		Steps: []StepDefinition{
			{
				ID:           "slow_step",
				Name:         "Slow Step",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10s"}, // 10s delay
				Dependencies: []string{},
			},
		},
	}

	ctx := context.Background()
	run, err := executor.Execute(ctx, "run-003", def)

	if err == nil {
		t.Fatal("expected timeout error")
	}
	if run.Status != RunStatusTimeout {
		t.Errorf("expected status 'timeout', got '%s'", run.Status)
	}
}

func TestExecutor_ContextCancellation(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	def := DAGDefinition{
		Timeout: 30,
		Steps: []StepDefinition{
			{
				ID:           "long_step",
				Name:         "Long Step",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "30s"},
				Dependencies: []string{},
			},
		},
	}

	ctx, cancel := context.WithCancel(context.Background())

	// Cancel after 100ms
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	run, err := executor.Execute(ctx, "run-004", def)

	if err == nil {
		t.Fatal("expected cancellation error")
	}
	if run.Status != RunStatusTimeout && run.Status != RunStatusFailed {
		t.Errorf("expected timeout or failed status, got '%s'", run.Status)
	}
}

func TestExecutor_ParallelExecution(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	// step1 and step2 run in parallel, step3 waits for both
	def := DAGDefinition{
		Timeout: 30,
		Steps: []StepDefinition{
			{
				ID:           "parallel1",
				Name:         "Parallel 1",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "100ms"},
				Dependencies: []string{},
			},
			{
				ID:           "parallel2",
				Name:         "Parallel 2",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "100ms"},
				Dependencies: []string{},
			},
			{
				ID:           "final",
				Name:         "Final",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"parallel1", "parallel2"},
			},
		},
	}

	ctx := context.Background()
	start := time.Now()
	run, err := executor.Execute(ctx, "run-005", def)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if run.Status != RunStatusSuccess {
		t.Errorf("expected success, got '%s'", run.Status)
	}

	// If truly parallel, should take ~110ms not ~210ms
	// Give generous margin of 500ms
	if elapsed > 500*time.Millisecond {
		t.Errorf("parallel execution took too long: %v (expected < 500ms)", elapsed)
	}
}

func TestExecutor_RetryOnFailure(t *testing.T) {
	callCount := 0
	var mu sync.Mutex

	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 2,
		OnStepUpdate: func(runID string, result *StepResult) {
			mu.Lock()
			defer mu.Unlock()
			if result.Status == "running" {
				callCount++
			}
		},
	})

	// HTTP step pointing to invalid URL — will fail and retry
	def := DAGDefinition{
		Timeout: 30,
		Steps: []StepDefinition{
			{
				ID:   "failing_step",
				Name: "Failing Step",
				Type: StepTypeHTTP,
				Config: map[string]interface{}{
					"url":    "http://localhost:19999/nonexistent",
					"method": "GET",
				},
				Dependencies: []string{},
				RetryConfig: &RetryConfig{
					MaxRetries:        2,
					BackoffMultiplier: 1.0, // no backoff for fast test
				},
			},
		},
	}

	ctx := context.Background()
	run, _ := executor.Execute(ctx, "run-006", def)

	// Should have attempted 3 times (1 initial + 2 retries)
	mu.Lock()
	attempts := callCount
	mu.Unlock()

	if attempts != 3 {
		t.Errorf("expected 3 attempts (1 + 2 retries), got %d", attempts)
	}
	if run.Status != RunStatusFailed {
		t.Errorf("expected failed status after exhausting retries, got '%s'", run.Status)
	}
}

func TestExecutor_InvalidDAG(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	// DAG with cycle
	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID: "A", Name: "A", Type: StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"B"},
			},
			{
				ID: "B", Name: "B", Type: StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{"A"},
			},
		},
	}

	ctx := context.Background()
	run, err := executor.Execute(ctx, "run-007", def)

	if err == nil {
		t.Fatal("expected error for cyclic DAG")
	}
	if run.Status != RunStatusFailed {
		t.Errorf("expected failed status, got '%s'", run.Status)
	}
}

func TestExecutor_SingleStep(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{
		DefaultTimeout:    30 * time.Second,
		DefaultMaxRetries: 1,
	})

	def := DAGDefinition{
		Timeout: 30,
		Steps: []StepDefinition{
			{
				ID:           "only_step",
				Name:         "Only Step",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "10ms"},
				Dependencies: []string{},
			},
		},
	}

	ctx := context.Background()
	run, err := executor.Execute(ctx, "run-008", def)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if run.Status != RunStatusSuccess {
		t.Errorf("expected success, got '%s'", run.Status)
	}
	if _, ok := run.StepResults["only_step"]; !ok {
		t.Error("expected step result for 'only_step'")
	}
}

func TestCollectInputs(t *testing.T) {
	executor := NewExecutor(ExecutorConfig{})

	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID: "step1", Name: "Step 1", Type: StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{},
			},
			{
				ID: "step2", Name: "Step 2", Type: StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{"step1"},
			},
		},
	}

	dag, err := ParseDAG(def)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Mock run with step1 completed
	run := &WorkflowRun{
		StepResults: map[string]*StepResult{
			"step1": {
				StepID: "step1",
				Status: "success",
				Output: map[string]interface{}{
					"status_code": 200,
					"body":        "hello",
				},
			},
		},
	}

	inputs := executor.collectInputs("step2", dag, run)

	if _, ok := inputs["step1"]; !ok {
		t.Error("expected step1 output in step2 inputs")
	}
}