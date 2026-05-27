package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/AnsiMauludina/flowforge/internal/engine"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

func (h *Handler) ListWorkflows(c *gin.Context) {
	tenantID, err := parseUUID(appMiddleware.GetTenantID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid tenant id"})
		return
	}

	result, err := h.workflowRepo.List(
		c.Request.Context(), tenantID, parsePagination(c), parseFilter(c),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to list workflows"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) CreateWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	userID, _ := parseUUID(appMiddleware.GetUserID(c))

	var req struct {
		Name           string                 `json:"name" validate:"required,min=3"`
		Description    string                 `json:"description"`
		DAG            map[string]interface{} `json:"dag" validate:"required"`
		CronExpression string                 `json:"cron_expression"`
	}

	if !bindAndValidate(c, &req, h.validate) {
		return
	}

	dagDef, err := parseDAGFromMap(req.DAG)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid DAG: " + err.Error()})
		return
	}
	if _, err := engine.ParseDAG(*dagDef); err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "DAG validation failed: " + err.Error()})
		return
	}

	workflow := &model.WorkflowDefinition{
		TenantID:       tenantID,
		Name:           req.Name,
		Description:    req.Description,
		DAG:            req.DAG,
		IsActive:       true,
		CronExpression: req.CronExpression,
		CreatedBy:      userID,
	}

	if err := h.workflowRepo.Create(c.Request.Context(), workflow); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create workflow"})
		return
	}

	// Register cron job if expression is set
	if h.scheduler != nil {
		if err := h.scheduler.Add(workflow); err != nil {
			// Non-fatal: workflow is created, just log the scheduling failure
			c.Header("X-Schedule-Warning", err.Error())
		}
	}

	successResponse(c, http.StatusCreated, workflow)
}

func (h *Handler) GetWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	workflow, err := h.workflowRepo.GetByID(
		c.Request.Context(), workflowID, tenantID,
	)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "workflow not found"})
		return
	}

	successResponse(c, http.StatusOK, workflow)
}

func (h *Handler) UpdateWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	var req struct {
		Name           string                 `json:"name" validate:"required,min=3"`
		Description    string                 `json:"description"`
		DAG            map[string]interface{} `json:"dag" validate:"required"`
		CronExpression string                 `json:"cron_expression"`
	}

	if !bindAndValidate(c, &req, h.validate) {
		return
	}

	dagDef, err := parseDAGFromMap(req.DAG)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid DAG: " + err.Error()})
		return
	}
	if _, err := engine.ParseDAG(*dagDef); err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "DAG validation failed: " + err.Error()})
		return
	}

	ctx := c.Request.Context()
	workflow, err := h.workflowRepo.GetByID(ctx, workflowID, tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "workflow not found"})
		return
	}

	workflow.Name = req.Name
	workflow.Description = req.Description
	workflow.DAG = req.DAG
	workflow.CronExpression = req.CronExpression

	if err := h.workflowRepo.Update(ctx, workflow); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to update workflow"})
		return
	}

	// Re-register cron job with updated expression (Add replaces existing entry)
	if h.scheduler != nil {
		if workflow.CronExpression != "" {
			if err := h.scheduler.Add(workflow); err != nil {
				c.Header("X-Schedule-Warning", err.Error())
			}
		} else {
			// Expression cleared — remove any existing schedule
			h.scheduler.Remove(workflow.ID)
		}
	}

	successResponse(c, http.StatusOK, workflow)
}

func (h *Handler) DeleteWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	if err := h.workflowRepo.Delete(
		c.Request.Context(), workflowID, tenantID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to delete workflow"})
		return
	}

	// Remove cron job when workflow is soft-deleted
	if h.scheduler != nil {
		h.scheduler.Remove(workflowID)
	}

	c.JSON(http.StatusOK, Response{Message: "workflow deleted"})
}

func (h *Handler) GetWorkflowVersions(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	versions, err := h.workflowRepo.GetVersions(
		c.Request.Context(), workflowID, tenantID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to get versions"})
		return
	}

	successResponse(c, http.StatusOK, versions)
}

func (h *Handler) TriggerWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	ctx := c.Request.Context()
	workflow, err := h.workflowRepo.GetByID(ctx, workflowID, tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "workflow not found"})
		return
	}

	run := &model.WorkflowRun{
		WorkflowID:  workflow.ID,
		TenantID:    workflow.TenantID,
		Status:      model.RunStatusPending,
		TriggerType: "manual",
	}
	if err := h.workflowRepo.CreateRun(ctx, run); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create run"})
		return
	}

	go h.executeWorkflow(run.ID, workflow)

	successResponse(c, http.StatusAccepted, gin.H{
		"run_id":  run.ID,
		"status":  run.Status,
		"message": "workflow triggered successfully",
	})
}

// TriggerScheduled is called by the cron scheduler (not an HTTP handler).
// It creates a run record and executes the workflow asynchronously.
func (h *Handler) TriggerScheduled(wf *model.WorkflowDefinition, triggerType string) {
	ctx := context.Background()

	run := &model.WorkflowRun{
		WorkflowID:  wf.ID,
		TenantID:    wf.TenantID,
		Status:      model.RunStatusPending,
		TriggerType: triggerType,
	}
	if err := h.workflowRepo.CreateRun(ctx, run); err != nil {
		return
	}

	go h.executeWorkflow(run.ID, wf)
}

func (h *Handler) GetWorkflowRuns(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	result, err := h.workflowRepo.GetRunsByWorkflow(
		c.Request.Context(), workflowID, tenantID, parsePagination(c),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to get runs"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetRunSteps returns all step runs for a specific workflow run.
// GET /api/v1/runs/:run_id/steps
func (h *Handler) GetRunSteps(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	runID, err := parseUUID(c.Param("run_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid run id"})
		return
	}

	steps, err := h.workflowRepo.GetStepRunsByRunID(
		c.Request.Context(), runID, tenantID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to get step runs"})
		return
	}

	successResponse(c, http.StatusOK, steps)
}

// RollbackWorkflow restores a workflow to a specific historical version.
// POST /api/v1/workflows/:id/rollback/:version
func (h *Handler) RollbackWorkflow(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	version, err := strconv.Atoi(c.Param("version"))
	if err != nil || version < 1 {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid version number"})
		return
	}

	wf, err := h.workflowRepo.RollbackToVersion(
		c.Request.Context(), workflowID, tenantID, version,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "rollback failed: " + err.Error()})
		return
	}

	// Re-register cron if the restored DAG was for a scheduled workflow
	if h.scheduler != nil {
		if wf.CronExpression != "" {
			h.scheduler.Add(wf)
		}
	}

	successResponse(c, http.StatusOK, wf)
}

func (h *Handler) GetHealthMetrics(c *gin.Context) {
	tenantID, _ := parseUUID(appMiddleware.GetTenantID(c))

	metrics, err := h.workflowRepo.GetHealthMetrics(
		c.Request.Context(), tenantID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to get metrics"})
		return
	}

	successResponse(c, http.StatusOK, metrics)
}

func (h *Handler) executeWorkflow(
	runID uuid.UUID,
	workflow *model.WorkflowDefinition,
) {
	ctx := context.Background()

	dagDef, err := parseDAGFromMap(workflow.DAG)
	if err != nil {
		return
	}

	now := time.Now()
	h.workflowRepo.UpdateRunStatus(ctx, runID,
		model.RunStatusRunning, &now, nil,
	)

	exec := engine.NewExecutor(engine.ExecutorConfig{
		DefaultTimeout:    30 * time.Minute,
		DefaultMaxRetries: 3,
		OnStepUpdate: func(runIDStr string, result *engine.StepResult) {
			stepRun := &model.StepRun{
				RunID:   runID,
				StepID:  result.StepID,
				Status:  model.StepStatus(result.Status),
				Attempt: result.Attempt,
				Error:   result.Error,
				Output:  result.Output,
			}
			if !result.StartedAt.IsZero() {
				stepRun.StartedAt = &result.StartedAt
			}
			if !result.FinishedAt.IsZero() {
				stepRun.FinishedAt = &result.FinishedAt
			}
			h.workflowRepo.CreateStepRun(ctx, stepRun)

			if h.hub != nil {
				h.hub.BroadcastToRun(runID.String(), result)
			}
		},
	})

	result, _ := exec.Execute(ctx, runID.String(), *dagDef)

	finishedAt := time.Now()
	h.workflowRepo.UpdateRunStatus(ctx, runID,
		model.RunStatus(result.Status), nil, &finishedAt,
	)
}

func parseDAGFromMap(m map[string]interface{}) (*engine.DAGDefinition, error) {
	jsonBytes, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var dagDef engine.DAGDefinition
	if err := json.Unmarshal(jsonBytes, &dagDef); err != nil {
		return nil, err
	}
	return &dagDef, nil
}