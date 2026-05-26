package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

func setupTestRouter(h *Handler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	return r
}

func TestListWorkflows_Unauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{}
	r.GET("/api/v1/workflows", h.ListWorkflows)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/workflows", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Without JWT middleware, tenant ID will be empty
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWorkflow_InvalidBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{
		validate: newValidator(),
	}

	// Inject tenant context
	r.POST("/api/v1/workflows", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.CreateWorkflow)

	// Send invalid body
	body := bytes.NewBufferString(`{"name": ""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/workflows", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWorkflow_InvalidDAG(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{
		validate: newValidator(),
	}

	r.POST("/api/v1/workflows", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.CreateWorkflow)

	// DAG with cycle
	payload := map[string]interface{}{
		"name": "Test Workflow",
		"dag": map[string]interface{}{
			"timeout": 60,
			"steps": []map[string]interface{}{
				{
					"id": "A", "name": "A", "type": "delay",
					"config":       map[string]interface{}{"duration": "1s"},
					"dependencies": []string{"B"},
				},
				{
					"id": "B", "name": "B", "type": "delay",
					"config":       map[string]interface{}{"duration": "1s"},
					"dependencies": []string{"A"},
				},
			},
		},
	}

	bodyBytes, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/workflows",
		bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp Response
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Contains(t, resp.Error, "DAG")
}

func TestTriggerWorkflow_NotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	mockRepo := &mockWorkflowRepo{}
	h := &Handler{
		workflowRepo: mockRepo,
		validate:     newValidator(),
	}

	r.POST("/api/v1/workflows/:id/trigger", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.TriggerWorkflow)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/workflows/"+uuid.New().String()+"/trigger",
		nil,
	)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetWorkflow_InvalidID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{validate: newValidator()}
	r.GET("/api/v1/workflows/:id", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Next()
	}, h.GetWorkflow)

	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/workflows/not-a-valid-uuid",
		nil,
	)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestDeleteWorkflow_RequiresValidID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{validate: newValidator()}
	r.DELETE("/api/v1/workflows/:id", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Next()
	}, h.DeleteWorkflow)

	req := httptest.NewRequest(
		http.MethodDelete,
		"/api/v1/workflows/invalid-id",
		nil,
	)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Helpers ──────────────────────────────────────────

func newValidator() *validator.Validate {
	return validator.New()
}

// mockWorkflowRepo returns errors for all calls
type mockWorkflowRepo struct{}

func (m *mockWorkflowRepo) GetByID(
	ctx context.Context,
	id uuid.UUID,
	tenantID uuid.UUID,
) (*model.WorkflowDefinition, error) {
	return nil, fmt.Errorf("not found")
}

func (m *mockWorkflowRepo) List(ctx context.Context,
	tenantID uuid.UUID,
	params model.PaginationParams,
) (*model.PaginatedResponse[model.WorkflowDefinition], error) {
	return nil, fmt.Errorf("not found")
}

func (m *mockWorkflowRepo) Create(ctx context.Context,
	w *model.WorkflowDefinition,
) error {
	return fmt.Errorf("error")
}

func (m *mockWorkflowRepo) Update(ctx context.Context,
	w *model.WorkflowDefinition,
) error {
	return fmt.Errorf("error")
}

func (m *mockWorkflowRepo) Delete(ctx context.Context,
	id, tenantID uuid.UUID,
) error {
	return fmt.Errorf("error")
}