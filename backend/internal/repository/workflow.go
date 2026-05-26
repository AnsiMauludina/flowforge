package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

type WorkflowRepository struct {
	db *DB
}

func NewWorkflowRepository(db *DB) *WorkflowRepository {
	return &WorkflowRepository{db: db}
}

// --- Workflow CRUD ---

func (r *WorkflowRepository) Create(
	ctx context.Context,
	w *model.WorkflowDefinition,
) error {
	w.ID = uuid.New()
	w.Version = 1
	w.CreatedAt = time.Now()
	w.UpdatedAt = time.Now()

	dagJSON, err := json.Marshal(w.DAG)
	if err != nil {
		return fmt.Errorf("marshal DAG: %w", err)
	}

	query := `
		INSERT INTO workflow_definitions
			(id, tenant_id, name, description, dag, version,
			 is_active, cron_expression, created_by, created_at, updated_at)
		VALUES
			(:id, :tenant_id, :name, :description, :dag, :version,
			 :is_active, :cron_expression, :created_by, :created_at, :updated_at)
	`

	_, err = r.db.NamedExecContext(ctx, query, map[string]interface{}{
		"id":              w.ID,
		"tenant_id":       w.TenantID,
		"name":            w.Name,
		"description":     w.Description,
		"dag":             string(dagJSON),
		"version":         w.Version,
		"is_active":       w.IsActive,
		"cron_expression": w.CronExpression,
		"created_by":      w.CreatedBy,
		"created_at":      w.CreatedAt,
		"updated_at":      w.UpdatedAt,
	})

	if err != nil {
		return fmt.Errorf("create workflow: %w", err)
	}

	// Save initial version
	return r.saveVersion(ctx, w)
}

func (r *WorkflowRepository) GetByID(
	ctx context.Context,
	id uuid.UUID,
	tenantID uuid.UUID,
) (*model.WorkflowDefinition, error) {
	query := `
		SELECT id, tenant_id, name, description, dag, version,
			   is_active, cron_expression, created_by, created_at, updated_at
		FROM workflow_definitions
		WHERE id = $1 AND tenant_id = $2
	`

	row := r.db.QueryRowContext(ctx, query, id, tenantID)

	var w model.WorkflowDefinition
	var dagJSON string

	err := row.Scan(
		&w.ID, &w.TenantID, &w.Name, &w.Description,
		&dagJSON, &w.Version, &w.IsActive, &w.CronExpression,
		&w.CreatedBy, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get workflow: %w", err)
	}

	if err := json.Unmarshal([]byte(dagJSON), &w.DAG); err != nil {
		return nil, fmt.Errorf("unmarshal DAG: %w", err)
	}

	return &w, nil
}

func (r *WorkflowRepository) List(
	ctx context.Context,
	tenantID uuid.UUID,
	params model.PaginationParams,
	filter model.WorkflowFilter,
) (*model.PaginatedResponse[model.WorkflowDefinition], error) {
	if params.Page < 1 {
		params.Page = 1
	}
	if params.Limit < 1 || params.Limit > 100 {
		params.Limit = 20
	}
	offset := (params.Page - 1) * params.Limit

	// Build dynamic WHERE clause
	args := []interface{}{tenantID} // $1 always = tenant_id
	where := "WHERE tenant_id = $1"

	if filter.IsActive != nil {
		args = append(args, *filter.IsActive)
		where += fmt.Sprintf(" AND is_active = $%d", len(args))
	} else {
		// default: only active workflows (preserve original behaviour when no filter)
		where += " AND is_active = true"
	}

	if filter.Name != "" {
		args = append(args, "%"+filter.Name+"%")
		where += fmt.Sprintf(" AND name ILIKE $%d", len(args))
	}

	// Count total
	var total int64
	if err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM workflow_definitions "+where,
		args...,
	).Scan(&total); err != nil {
		return nil, fmt.Errorf("count workflows: %w", err)
	}

	// Fetch page — append LIMIT/OFFSET args after WHERE args
	args = append(args, params.Limit, offset)
	limitPlaceholder := fmt.Sprintf("$%d", len(args)-1)
	offsetPlaceholder := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		SELECT id, tenant_id, name, description, dag, version,
		       is_active, cron_expression, created_by, created_at, updated_at
		FROM workflow_definitions
		%s
		ORDER BY created_at DESC
		LIMIT %s OFFSET %s
	`, where, limitPlaceholder, offsetPlaceholder)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list workflows: %w", err)
	}
	defer rows.Close()

	var workflows []model.WorkflowDefinition
	for rows.Next() {
		var w model.WorkflowDefinition
		var dagJSON string

		if err := rows.Scan(
			&w.ID, &w.TenantID, &w.Name, &w.Description,
			&dagJSON, &w.Version, &w.IsActive, &w.CronExpression,
			&w.CreatedBy, &w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan workflow: %w", err)
		}

		if err := json.Unmarshal([]byte(dagJSON), &w.DAG); err != nil {
			return nil, fmt.Errorf("unmarshal DAG: %w", err)
		}

		workflows = append(workflows, w)
	}

	return &model.PaginatedResponse[model.WorkflowDefinition]{
		Data:  workflows,
		Total: total,
		Page:  params.Page,
		Limit: params.Limit,
	}, nil
}

func (r *WorkflowRepository) Update(
	ctx context.Context,
	w *model.WorkflowDefinition,
) error {
	w.Version++
	w.UpdatedAt = time.Now()

	dagJSON, err := json.Marshal(w.DAG)
	if err != nil {
		return fmt.Errorf("marshal DAG: %w", err)
	}

	query := `
		UPDATE workflow_definitions SET
			name = $1, description = $2, dag = $3,
			version = $4, cron_expression = $5, updated_at = $6
		WHERE id = $7 AND tenant_id = $8
	`
	_, err = r.db.ExecContext(ctx, query,
		w.Name, w.Description, string(dagJSON),
		w.Version, w.CronExpression, w.UpdatedAt,
		w.ID, w.TenantID,
	)
	if err != nil {
		return fmt.Errorf("update workflow: %w", err)
	}

	return r.saveVersion(ctx, w)
}

func (r *WorkflowRepository) Delete(
	ctx context.Context,
	id uuid.UUID,
	tenantID uuid.UUID,
) error {
	// Soft delete
	query := `
		UPDATE workflow_definitions
		SET is_active = false, updated_at = $1
		WHERE id = $2 AND tenant_id = $3
	`
	_, err := r.db.ExecContext(ctx, query, time.Now(), id, tenantID)
	return err
}

// --- Versions ---

func (r *WorkflowRepository) saveVersion(
	ctx context.Context,
	w *model.WorkflowDefinition,
) error {
	dagJSON, _ := json.Marshal(w.DAG)
	query := `
		INSERT INTO workflow_versions (id, workflow_id, version, dag, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.ExecContext(ctx, query,
		uuid.New(), w.ID, w.Version, string(dagJSON), time.Now(),
	)
	return err
}

func (r *WorkflowRepository) GetVersions(
	ctx context.Context,
	workflowID uuid.UUID,
	tenantID uuid.UUID,
) ([]model.WorkflowVersion, error) {
	query := `
		SELECT wv.id, wv.workflow_id, wv.version, wv.dag, wv.created_at
		FROM workflow_versions wv
		JOIN workflow_definitions wd ON wv.workflow_id = wd.id
		WHERE wv.workflow_id = $1 AND wd.tenant_id = $2
		ORDER BY wv.version DESC
	`
	rows, err := r.db.QueryContext(ctx, query, workflowID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var versions []model.WorkflowVersion
	for rows.Next() {
		var v model.WorkflowVersion
		var dagJSON string
		if err := rows.Scan(&v.ID, &v.WorkflowID, &v.Version, &dagJSON, &v.CreatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(dagJSON), &v.DAG)
		versions = append(versions, v)
	}
	return versions, nil
}

// --- Runs ---

func (r *WorkflowRepository) CreateRun(
	ctx context.Context,
	run *model.WorkflowRun,
) error {
	run.ID = uuid.New()
	run.CreatedAt = time.Now()

	query := `
		INSERT INTO workflow_runs
			(id, workflow_id, tenant_id, status, trigger_type, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.ExecContext(ctx, query,
		run.ID, run.WorkflowID, run.TenantID,
		run.Status, run.TriggerType, run.CreatedAt,
	)
	return err
}

func (r *WorkflowRepository) UpdateRunStatus(
	ctx context.Context,
	runID uuid.UUID,
	status model.RunStatus,
	startedAt *time.Time,
	finishedAt *time.Time,
) error {
	query := `
		UPDATE workflow_runs
		SET status = $1, started_at = $2, finished_at = $3
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, status, startedAt, finishedAt, runID)
	return err
}

func (r *WorkflowRepository) CreateStepRun(
	ctx context.Context,
	sr *model.StepRun,
) error {
	sr.ID = uuid.New()
	sr.CreatedAt = time.Now()

	inputJSON, _ := json.Marshal(sr.Input)
	outputJSON, _ := json.Marshal(sr.Output)

	query := `
		INSERT INTO step_runs
			(id, run_id, step_id, step_name, status, attempt,
			 input, output, error, started_at, finished_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`
	_, err := r.db.ExecContext(ctx, query,
		sr.ID, sr.RunID, sr.StepID, sr.StepName,
		sr.Status, sr.Attempt, string(inputJSON), string(outputJSON),
		sr.Error, sr.StartedAt, sr.FinishedAt, sr.CreatedAt,
	)
	return err
}

func (r *WorkflowRepository) GetRunsByWorkflow(
	ctx context.Context,
	workflowID uuid.UUID,
	tenantID uuid.UUID,
	params model.PaginationParams,
) (*model.PaginatedResponse[model.WorkflowRun], error) {
	if params.Limit < 1 {
		params.Limit = 20
	}
	if params.Page < 1 {
		params.Page = 1
	}
	offset := (params.Page - 1) * params.Limit

	var total int64
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM workflow_runs WHERE workflow_id=$1 AND tenant_id=$2`,
		workflowID, tenantID,
	).Scan(&total)

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, workflow_id, tenant_id, status, trigger_type,
			   started_at, finished_at, created_at
		FROM workflow_runs
		WHERE workflow_id=$1 AND tenant_id=$2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`, workflowID, tenantID, params.Limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []model.WorkflowRun
	for rows.Next() {
		var run model.WorkflowRun
		rows.Scan(
			&run.ID, &run.WorkflowID, &run.TenantID, &run.Status,
			&run.TriggerType, &run.StartedAt, &run.FinishedAt, &run.CreatedAt,
		)
		runs = append(runs, run)
	}

	return &model.PaginatedResponse[model.WorkflowRun]{
		Data: runs, Total: total,
		Page: params.Page, Limit: params.Limit,
	}, nil
}

func (r *WorkflowRepository) GetHealthMetrics(
	ctx context.Context,
	tenantID uuid.UUID,
) (*model.HealthMetrics, error) {
	query := `
		SELECT
			COUNT(*) FILTER (WHERE status = 'running') as active_runs,
			COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as total_24h,
			COUNT(*) FILTER (WHERE status = 'success' AND created_at > NOW() - INTERVAL '24 hours') as success_24h,
			COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_24h,
			COALESCE(AVG(
				EXTRACT(EPOCH FROM (finished_at - started_at))
			) FILTER (WHERE finished_at IS NOT NULL AND started_at IS NOT NULL
				AND created_at > NOW() - INTERVAL '24 hours'), 0) as avg_duration
		FROM workflow_runs
		WHERE tenant_id = $1
	`

	var activeRuns, total24h, success24h, failed24h int
	var avgDuration float64

	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&activeRuns, &total24h, &success24h, &failed24h, &avgDuration,
	)
	if err != nil {
		return nil, err
	}

	var successRate, failureRate float64
	if total24h > 0 {
		successRate = float64(success24h) / float64(total24h) * 100
		failureRate = float64(failed24h) / float64(total24h) * 100
	}

	return &model.HealthMetrics{
		ActiveRuns:       activeRuns,
		SuccessRate:      successRate,
		FailureRate:      failureRate,
		AvgExecutionTime: avgDuration,
		TotalRuns24h:     total24h,
	}, nil
}

// ListAllScheduled returns all active workflows that have a cron expression set,
// across all tenants. Used by the scheduler at startup.
func (r *WorkflowRepository) ListAllScheduled(ctx context.Context) ([]model.WorkflowDefinition, error) {
	query := `
		SELECT id, tenant_id, name, description, dag, version,
		       is_active, cron_expression, created_by, created_at, updated_at
		FROM workflow_definitions
		WHERE is_active = true
		  AND cron_expression IS NOT NULL
		  AND cron_expression != ''
		ORDER BY created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list scheduled workflows: %w", err)
	}
	defer rows.Close()

	var workflows []model.WorkflowDefinition
	for rows.Next() {
		var w model.WorkflowDefinition
		var dagJSON string
		if err := rows.Scan(
			&w.ID, &w.TenantID, &w.Name, &w.Description,
			&dagJSON, &w.Version, &w.IsActive, &w.CronExpression,
			&w.CreatedBy, &w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan scheduled workflow: %w", err)
		}
		if err := json.Unmarshal([]byte(dagJSON), &w.DAG); err != nil {
			return nil, fmt.Errorf("unmarshal DAG: %w", err)
		}
		workflows = append(workflows, w)
	}
	return workflows, nil
}