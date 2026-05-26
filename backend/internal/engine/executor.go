package engine

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"
)

// RunStatus represents workflow run status
type RunStatus string

const (
	RunStatusPending   RunStatus = "pending"
	RunStatusRunning   RunStatus = "running"
	RunStatusSuccess   RunStatus = "success"
	RunStatusFailed    RunStatus = "failed"
	RunStatusTimeout   RunStatus = "timeout"
	RunStatusCancelled RunStatus = "cancelled"
)

// WorkflowRun holds the state of a workflow execution
type WorkflowRun struct {
	ID          string
	WorkflowID  string
	Status      RunStatus
	StepResults map[string]*StepResult
	StartedAt   time.Time
	FinishedAt  time.Time
	Error       string
}

// StepUpdateFn is called whenever a step status changes
// Used for real-time WebSocket updates
type StepUpdateFn func(runID string, result *StepResult)

// ExecutorConfig holds executor settings
type ExecutorConfig struct {
	DefaultTimeout    time.Duration
	DefaultMaxRetries int
	OnStepUpdate      StepUpdateFn
}

// Executor orchestrates workflow execution
type Executor struct {
	config   ExecutorConfig
	stepExec *StepExecutor
}

// NewExecutor creates a new workflow executor
func NewExecutor(cfg ExecutorConfig) *Executor {
	if cfg.DefaultTimeout == 0 {
		cfg.DefaultTimeout = 30 * time.Minute
	}
	if cfg.DefaultMaxRetries == 0 {
		cfg.DefaultMaxRetries = 3
	}
	return &Executor{
		config:   cfg,
		stepExec: &StepExecutor{},
	}
}

// Execute runs a workflow definition and returns the run result
func (e *Executor) Execute(
	ctx context.Context,
	runID string,
	def DAGDefinition,
) (*WorkflowRun, error) {
	run := &WorkflowRun{
		ID:          runID,
		Status:      RunStatusRunning,
		StepResults: make(map[string]*StepResult),
		StartedAt:   time.Now(),
	}

	// Parse the DAG
	dag, err := ParseDAG(def)
	if err != nil {
		run.Status = RunStatusFailed
		run.Error = fmt.Sprintf("DAG parse error: %s", err.Error())
		run.FinishedAt = time.Now()
		return run, err
	}

	// Get execution levels (parallel groups)
	levels, err := dag.TopologicalSort()
	if err != nil {
		run.Status = RunStatusFailed
		run.Error = err.Error()
		run.FinishedAt = time.Now()
		return run, err
	}

	// Set global timeout
	timeout := time.Duration(def.Timeout) * time.Second
	if timeout == 0 {
		timeout = e.config.DefaultTimeout
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Execute levels sequentially, steps within each level in parallel
	for levelIdx, level := range levels {
		if err := e.executeLevel(ctx, runID, levelIdx, level, dag, run); err != nil {
			run.Status = RunStatusFailed
			run.Error = err.Error()
			run.FinishedAt = time.Now()

			// Check if it was a timeout
			if ctx.Err() == context.DeadlineExceeded {
				run.Status = RunStatusTimeout
			}
			return run, err
		}

		// Check context after each level
		select {
		case <-ctx.Done():
			run.Status = RunStatusTimeout
			run.FinishedAt = time.Now()
			return run, ctx.Err()
		default:
		}
	}

	run.Status = RunStatusSuccess
	run.FinishedAt = time.Now()
	return run, nil
}

// executeLevel runs all steps in a level concurrently
func (e *Executor) executeLevel(
	ctx context.Context,
	runID string,
	levelIdx int,
	stepIDs []string,
	dag *DAG,
	run *WorkflowRun,
) error {
	var wg sync.WaitGroup
	errChan := make(chan error, len(stepIDs))
	resultChan := make(chan *StepResult, len(stepIDs))

	for _, stepID := range stepIDs {
		wg.Add(1)
		go func(sid string) {
			defer wg.Done()

			step := dag.Steps[sid]

			// Collect outputs from dependency steps as input
			input := e.collectInputs(sid, dag, run)

			// Execute with retry
			result := e.executeWithRetry(ctx, step, input, runID)
			resultChan <- result

			if result.Status == "failed" {
				errChan <- fmt.Errorf("step '%s' failed: %s", sid, result.Error)
			}
		}(stepID)
	}

	// Wait for all steps in this level
	wg.Wait()
	close(resultChan)
	close(errChan)

	// Collect results
	for result := range resultChan {
		run.StepResults[result.StepID] = result
	}

	// Return first error if any
	if err, ok := <-errChan; ok {
		return err
	}

	return nil
}

// executeWithRetry runs a step with exponential backoff retry
func (e *Executor) executeWithRetry(
	ctx context.Context,
	step *StepDefinition,
	input map[string]interface{},
	runID string,
) *StepResult {
	maxRetries := e.config.DefaultMaxRetries
	backoffMultiplier := 2.0

	if step.RetryConfig != nil {
		maxRetries = step.RetryConfig.MaxRetries
		backoffMultiplier = step.RetryConfig.BackoffMultiplier
	}

	var lastResult *StepResult

	for attempt := 1; attempt <= maxRetries+1; attempt++ {
		// Notify step is running
		if e.config.OnStepUpdate != nil {
			e.config.OnStepUpdate(runID, &StepResult{
				StepID:    step.ID,
				Status:    "running",
				Attempt:   attempt,
				StartedAt: time.Now(),
			})
		}

		lastResult = e.stepExec.Execute(ctx, step, input, attempt)

		// Notify step result
		if e.config.OnStepUpdate != nil {
			e.config.OnStepUpdate(runID, lastResult)
		}

		if lastResult.Status == "success" {
			return lastResult
		}

		// Don't retry if context is done
		if ctx.Err() != nil {
			return lastResult
		}

		// Don't retry on last attempt
		if attempt > maxRetries {
			break
		}

		// Exponential backoff: 1s, 2s, 4s, 8s...
		backoff := time.Duration(math.Pow(backoffMultiplier,
			float64(attempt-1))) * time.Second

		select {
		case <-time.After(backoff):
			// continue to next attempt
		case <-ctx.Done():
			lastResult.Status = "failed"
			lastResult.Error = "context cancelled during retry backoff"
			return lastResult
		}
	}

	return lastResult
}

// collectInputs gathers outputs from dependency steps
func (e *Executor) collectInputs(
	stepID string,
	dag *DAG,
	run *WorkflowRun,
) map[string]interface{} {
	input := make(map[string]interface{})
	step := dag.Steps[stepID]

	for _, depID := range step.Dependencies {
		if result, ok := run.StepResults[depID]; ok && result.Output != nil {
			// Namespace by step ID to avoid key conflicts
			input[depID] = result.Output
		}
	}

	return input
}