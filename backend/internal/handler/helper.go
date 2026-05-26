package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

func parsePagination(c *gin.Context) model.PaginationParams {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	return model.PaginationParams{
		Page:  page,
		Limit: limit,
		Sort:  c.Query("sort"),
	}
}

// parseFilter extracts name and is_active query params.
// ?is_active=true → filter active only
// ?is_active=false → filter inactive only
// (omitted) → all workflows (no is_active filter)
func parseFilter(c *gin.Context) model.WorkflowFilter {
	f := model.WorkflowFilter{
		Name: strings.TrimSpace(c.Query("name")),
	}
	if raw := c.Query("is_active"); raw != "" {
		v := raw == "true"
		f.IsActive = &v
	}
	return f
}

func bindAndValidate(c *gin.Context, req interface{}, v *validator.Validate) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid request body"})
		return false
	}
	if err := v.Struct(req); err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: err.Error()})
		return false
	}
	return true
}