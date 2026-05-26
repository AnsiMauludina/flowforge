package engine

import (
	"testing"
)

func TestParseDAG_Valid(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID:   "step1",
				Name: "Fetch Data",
				Type: StepTypeHTTP,
				Config: map[string]interface{}{
					"url":    "https://api.example.com",
					"method": "GET",
				},
				Dependencies: []string{},
			},
			{
				ID:   "step2",
				Name: "Process Data",
				Type: StepTypeScript,
				Config: map[string]interface{}{
					"script": "echo hello",
				},
				Dependencies: []string{"step1"},
			},
			{
				ID:   "step3",
				Name: "Wait",
				Type: StepTypeDelay,
				Config: map[string]interface{}{
					"duration": "5s",
				},
				Dependencies: []string{"step1"},
			},
			{
				ID:   "step4",
				Name: "Notify",
				Type: StepTypeHTTP,
				Config: map[string]interface{}{
					"url":    "https://notify.example.com",
					"method": "POST",
				},
				Dependencies: []string{"step2", "step3"},
			},
		},
	}

	dag, err := ParseDAG(def)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(dag.Steps) != 4 {
		t.Errorf("expected 4 steps, got %d", len(dag.Steps))
	}
}

func TestParseDAG_EmptySteps(t *testing.T) {
	def := DAGDefinition{Steps: []StepDefinition{}}
	_, err := ParseDAG(def)
	if err == nil {
		t.Fatal("expected error for empty steps")
	}
}

func TestParseDAG_DuplicateID(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{ID: "step1", Name: "Step 1", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"}},
			{ID: "step1", Name: "Step 1 Dup", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"}},
		},
	}
	_, err := ParseDAG(def)
	if err == nil {
		t.Fatal("expected error for duplicate step ID")
	}
}

func TestParseDAG_UnknownDependency(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID: "step1", Name: "Step 1",
				Type:         StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{"unknown_step"},
			},
		},
	}
	_, err := ParseDAG(def)
	if err == nil {
		t.Fatal("expected error for unknown dependency")
	}
}

func TestParseDAG_CycleDetection(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID: "step1", Name: "Step 1",
				Type:         StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{"step3"},
			},
			{
				ID: "step2", Name: "Step 2",
				Type:         StepTypeScript,
				Config:       map[string]interface{}{"script": "echo hi"},
				Dependencies: []string{"step1"},
			},
			{
				ID: "step3", Name: "Step 3",
				Type:         StepTypeDelay,
				Config:       map[string]interface{}{"duration": "1s"},
				Dependencies: []string{"step2"},
			},
		},
	}
	_, err := ParseDAG(def)
	if err == nil {
		t.Fatal("expected cycle detection error")
	}
}

func TestTopologicalSort_ParallelLevels(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{
				ID: "A", Name: "A",
				Type:         StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{},
			},
			{
				ID: "B", Name: "B",
				Type:         StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{},
			},
			{
				ID: "C", Name: "C",
				Type:         StepTypeHTTP,
				Config:       map[string]interface{}{"url": "http://example.com"},
				Dependencies: []string{"A", "B"},
			},
		},
	}

	dag, err := ParseDAG(def)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	levels, err := dag.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Level 0 should have A and B (parallel)
	// Level 1 should have C
	if len(levels) != 2 {
		t.Errorf("expected 2 levels, got %d", len(levels))
	}
	if len(levels[0]) != 2 {
		t.Errorf("expected 2 parallel steps in level 0, got %d", len(levels[0]))
	}
	if len(levels[1]) != 1 {
		t.Errorf("expected 1 step in level 1, got %d", len(levels[1]))
	}
	if levels[1][0] != "C" {
		t.Errorf("expected C in level 1, got %s", levels[1][0])
	}
}

func TestTopologicalSort_LinearChain(t *testing.T) {
	def := DAGDefinition{
		Steps: []StepDefinition{
			{ID: "A", Name: "A", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"}, Dependencies: []string{}},
			{ID: "B", Name: "B", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"}, Dependencies: []string{"A"}},
			{ID: "C", Name: "C", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"}, Dependencies: []string{"B"}},
		},
	}

	dag, err := ParseDAG(def)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	levels, err := dag.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Each step should be its own level
	if len(levels) != 3 {
		t.Errorf("expected 3 levels for linear chain, got %d", len(levels))
	}
}

func TestValidateStepConfig(t *testing.T) {
	tests := []struct {
		name    string
		step    StepDefinition
		wantErr bool
	}{
		{
			name: "valid HTTP step",
			step: StepDefinition{
				ID: "s1", Name: "S1", Type: StepTypeHTTP,
				Config: map[string]interface{}{"url": "http://example.com"},
			},
			wantErr: false,
		},
		{
			name: "HTTP step missing url",
			step: StepDefinition{
				ID: "s1", Name: "S1", Type: StepTypeHTTP,
				Config: map[string]interface{}{},
			},
			wantErr: true,
		},
		{
			name: "valid delay step",
			step: StepDefinition{
				ID: "s1", Name: "S1", Type: StepTypeDelay,
				Config: map[string]interface{}{"duration": "5s"},
			},
			wantErr: false,
		},
		{
			name: "delay step missing duration",
			step: StepDefinition{
				ID: "s1", Name: "S1", Type: StepTypeDelay,
				Config: map[string]interface{}{},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateStepConfig(&tt.step)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateStepConfig() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}