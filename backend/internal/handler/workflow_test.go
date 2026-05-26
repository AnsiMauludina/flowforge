package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func newValidator() *validator.Validate {
	return validator.New()
}

func TestListWorkflows_Unauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{}
	r.GET("/api/v1/workflows", h.ListWorkflows)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/workflows", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Without JWT middleware, tenant ID will be empty → bad request
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWorkflow_InvalidBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{validate: newValidator()}

	r.POST("/api/v1/workflows", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.CreateWorkflow)

	body := bytes.NewBufferString(`{"name": ""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/workflows", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWorkflow_CyclicDAG(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{validate: newValidator()}

	r.POST("/api/v1/workflows", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.CreateWorkflow)

	// DAG with cycle A→B→A
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

func TestDeleteWorkflow_InvalidID(t *testing.T) {
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

func TestTriggerWorkflow_InvalidID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &Handler{validate: newValidator()}
	r.POST("/api/v1/workflows/:id/trigger", func(c *gin.Context) {
		c.Set("tenant_id", uuid.New().String())
		c.Set("user_id", uuid.New().String())
		c.Next()
	}, h.TriggerWorkflow)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/workflows/not-a-uuid/trigger",
		nil,
	)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
