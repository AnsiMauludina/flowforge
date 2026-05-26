package handler

import (
	"github.com/go-playground/validator/v10"
	"github.com/AnsiMauludina/flowforge/internal/repository"
)

// Handler holds all dependencies
type Handler struct {
	workflowRepo *repository.WorkflowRepository
	userRepo     *repository.UserRepository
	jwtSecret    string
	validate     *validator.Validate
}

// NewHandler creates a new handler
func NewHandler(
	workflowRepo *repository.WorkflowRepository,
	userRepo *repository.UserRepository,
	jwtSecret string,
) *Handler {
	return &Handler{
		workflowRepo: workflowRepo,
		userRepo:     userRepo,
		jwtSecret:    jwtSecret,
		validate:     validator.New(),
	}
}

// Response helpers
type Response struct {
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func successResponse(data interface{}) Response {
	return Response{Data: data}
}

func errorResponse(msg string) Response {
	return Response{Error: msg}
}