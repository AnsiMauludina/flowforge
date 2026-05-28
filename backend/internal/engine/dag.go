package engine

import (
	"errors"
	"fmt"
)

// StepType defines the type of a workflow step
type StepType string

const (
	StepTypeHTTP       StepType = "http"
	StepTypeScript     StepType = "script"
	StepTypeJavaScript StepType = "javascript"
	StepTypeDelay      StepType = "delay"
	StepTypeCondition  StepType = "condition"
)

// RetryConfig holds retry settings for a step
type RetryConfig struct {
	MaxRetries        int     `json:"max_retries"`
	BackoffMultiplier float64 `json:"backoff_multiplier"`
}

// StepDefinition represents a single node in the DAG
type StepDefinition struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Type         StepType               `json:"type"`
	Config       map[string]interface{} `json:"config"`
	Dependencies []string               `json:"dependencies"`
	RetryConfig  *RetryConfig           `json:"retry_config,omitempty"`
}

// DAGDefinition represents the full workflow DAG
type DAGDefinition struct {
	Steps   []StepDefinition `json:"steps"`
	Timeout int              `json:"timeout"` // seconds
}

// DAG holds the parsed and validated graph
type DAG struct {
	Steps   map[string]*StepDefinition
	Edges   map[string][]string // stepID -> list of stepIDs that depend on it
	InDegree map[string]int     // stepID -> number of unresolved dependencies
}

// ParseDAG validates and builds the DAG from a definition
func ParseDAG(def DAGDefinition) (*DAG, error) {
	if len(def.Steps) == 0 {
		return nil, errors.New("workflow must have at least one step")
	}

	dag := &DAG{
		Steps:    make(map[string]*StepDefinition),
		Edges:    make(map[string][]string),
		InDegree: make(map[string]int),
	}

	// Register all steps
	for i := range def.Steps {
		step := &def.Steps[i]

		if step.ID == "" {
			return nil, fmt.Errorf("step at index %d has no ID", i)
		}
		if step.Name == "" {
			return nil, fmt.Errorf("step '%s' has no name", step.ID)
		}
		if !isValidStepType(step.Type) {
			return nil, fmt.Errorf("step '%s' has invalid type '%s'", step.ID, step.Type)
		}
		if _, exists := dag.Steps[step.ID]; exists {
			return nil, fmt.Errorf("duplicate step ID '%s'", step.ID)
		}

		dag.Steps[step.ID] = step
		dag.InDegree[step.ID] = 0
	}

	// Build edges and validate dependencies
	for _, step := range dag.Steps {
		for _, depID := range step.Dependencies {
			if _, exists := dag.Steps[depID]; !exists {
				return nil, fmt.Errorf("step '%s' depends on unknown step '%s'", step.ID, depID)
			}
			// depID -> step.ID (depID must finish before step.ID)
			dag.Edges[depID] = append(dag.Edges[depID], step.ID)
			dag.InDegree[step.ID]++
		}
	}

	// Detect cycles using topological sort
	if err := dag.detectCycles(); err != nil {
		return nil, err
	}

	return dag, nil
}

// TopologicalSort returns steps in valid execution order
// Steps with no dependencies come first
// Steps that can run in parallel are in the same level
func (d *DAG) TopologicalSort() ([][]string, error) {
	// Copy in-degrees to avoid mutating original
	inDegree := make(map[string]int)
	for id, deg := range d.InDegree {
		inDegree[id] = deg
	}

	var levels [][]string
	queue := []string{}

	// Start with all steps that have no dependencies
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	processed := 0

	for len(queue) > 0 {
		// Current queue = steps that can run in parallel
		levels = append(levels, queue)
		nextQueue := []string{}

		for _, stepID := range queue {
			processed++
			// For each step that depends on current step
			for _, dependentID := range d.Edges[stepID] {
				inDegree[dependentID]--
				if inDegree[dependentID] == 0 {
					nextQueue = append(nextQueue, dependentID)
				}
			}
		}

		queue = nextQueue
	}

	if processed != len(d.Steps) {
		return nil, errors.New("cycle detected in workflow DAG")
	}

	return levels, nil
}

// detectCycles runs topological sort to find cycles
func (d *DAG) detectCycles() error {
	_, err := d.TopologicalSort()
	return err
}

// Validate checks step configs based on type
func (d *DAG) Validate() error {
	for _, step := range d.Steps {
		if err := validateStepConfig(step); err != nil {
			return err
		}
	}
	return nil
}

func isValidStepType(t StepType) bool {
	switch t {
	case StepTypeHTTP, StepTypeScript, StepTypeJavaScript, StepTypeDelay, StepTypeCondition:
		return true
	}
	return false
}

func validateStepConfig(step *StepDefinition) error {
	switch step.Type {
	case StepTypeHTTP:
		if _, ok := step.Config["url"]; !ok {
			return fmt.Errorf("HTTP step '%s' missing 'url' in config", step.ID)
		}
	case StepTypeScript:
		if _, ok := step.Config["code"]; !ok {
			return fmt.Errorf("script step '%s' missing 'code' in config", step.ID)
		}
	case StepTypeJavaScript:
		if _, ok := step.Config["code"]; !ok {
			return fmt.Errorf("javascript step '%s' missing 'code' in config", step.ID)
		}
	case StepTypeDelay:
		if _, ok := step.Config["duration"]; !ok {
			return fmt.Errorf("delay step '%s' missing 'duration' in config", step.ID)
		}
	case StepTypeCondition:
		if _, ok := step.Config["expression"]; !ok {
			return fmt.Errorf("condition step '%s' missing 'expression' in config", step.ID)
		}
	}
	return nil
}