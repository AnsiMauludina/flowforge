package model

import (
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

type RunStatus string

const (
	RunStatusPending   RunStatus = "pending"
	RunStatusRunning   RunStatus = "running"
	RunStatusSuccess   RunStatus = "success"
	RunStatusFailed    RunStatus = "failed"
	RunStatusTimeout   RunStatus = "timeout"
	RunStatusCancelled RunStatus = "cancelled"
)

type StepStatus string

const (
	StepStatusPending  StepStatus = "pending"
	StepStatusRunning  StepStatus = "running"
	StepStatusSuccess  StepStatus = "success"
	StepStatusFailed   StepStatus = "failed"
	StepStatusSkipped  StepStatus = "skipped"
)

// Tenant represents an organization
type Tenant struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	Slug      string    `db:"slug" json:"slug"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// User represents a user in a tenant
type User struct {
	ID           uuid.UUID `db:"id" json:"id"`
	TenantID     uuid.UUID `db:"tenant_id" json:"tenant_id"`
	Email        string    `db:"email" json:"email"`
	PasswordHash string    `db:"password_hash" json:"-"`
	Role         Role      `db:"role" json:"role"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

// WorkflowDefinition represents a workflow
type WorkflowDefinition struct {
	ID             uuid.UUID              `db:"id" json:"id"`
	TenantID       uuid.UUID              `db:"tenant_id" json:"tenant_id"`
	Name           string                 `db:"name" json:"name"`
	Description    string                 `db:"description" json:"description"`
	DAG            map[string]interface{} `db:"dag" json:"dag"`
	Version        int                    `db:"version" json:"version"`
	IsActive       bool                   `db:"is_active" json:"is_active"`
	CronExpression string                 `db:"cron_expression" json:"cron_expression,omitempty"`
	CreatedBy      uuid.UUID              `db:"created_by" json:"created_by"`
	CreatedAt      time.Time              `db:"created_at" json:"created_at"`
	UpdatedAt      time.Time              `db:"updated_at" json:"updated_at"`
}

// WorkflowVersion stores historical versions
type WorkflowVersion struct {
	ID         uuid.UUID              `db:"id" json:"id"`
	WorkflowID uuid.UUID              `db:"workflow_id" json:"workflow_id"`
	Version    int                    `db:"version" json:"version"`
	DAG        map[string]interface{} `db:"dag" json:"dag"`
	CreatedAt  time.Time              `db:"created_at" json:"created_at"`
}

// WorkflowRun represents a workflow execution
type WorkflowRun struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	WorkflowID  uuid.UUID  `db:"workflow_id" json:"workflow_id"`
	TenantID    uuid.UUID  `db:"tenant_id" json:"tenant_id"`
	Status      RunStatus  `db:"status" json:"status"`
	TriggerType string     `db:"trigger_type" json:"trigger_type"`
	StartedAt   *time.Time `db:"started_at" json:"started_at,omitempty"`
	FinishedAt  *time.Time `db:"finished_at" json:"finished_at,omitempty"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
}

// StepRun represents a single step execution
type StepRun struct {
	ID         uuid.UUID              `db:"id" json:"id"`
	RunID      uuid.UUID              `db:"run_id" json:"run_id"`
	StepID     string                 `db:"step_id" json:"step_id"`
	StepName   string                 `db:"step_name" json:"step_name"`
	Status     StepStatus             `db:"status" json:"status"`
	Attempt    int                    `db:"attempt" json:"attempt"`
	Input      map[string]interface{} `db:"input" json:"input,omitempty"`
	Output     map[string]interface{} `db:"output" json:"output,omitempty"`
	Error      string                 `db:"error" json:"error,omitempty"`
	StartedAt  *time.Time             `db:"started_at" json:"started_at,omitempty"`
	FinishedAt *time.Time             `db:"finished_at" json:"finished_at,omitempty"`
	CreatedAt  time.Time              `db:"created_at" json:"created_at"`
}

// HealthMetrics for dashboard
type HealthMetrics struct {
	ActiveRuns       int     `json:"active_runs"`
	SuccessRate      float64 `json:"success_rate"`
	FailureRate      float64 `json:"failure_rate"`
	AvgExecutionTime float64 `json:"avg_execution_time"`
	TotalRuns24h     int     `json:"total_runs_24h"`
}

// Pagination
type PaginationParams struct {
	Page  int    `query:"page"`
	Limit int    `query:"limit"`
	Sort  string `query:"sort"`
}

type PaginatedResponse[T any] struct {
	Data  []T   `json:"data"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
}

// Auth
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type Claims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	Role     Role   `json:"role"`
}