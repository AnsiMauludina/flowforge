package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/AnsiMauludina/flowforge/config"
	"github.com/AnsiMauludina/flowforge/internal/repository"
	"github.com/AnsiMauludina/flowforge/internal/scheduler"
)

type Handler struct {
	workflowRepo *repository.WorkflowRepository
	webhookRepo  *repository.WebhookRepository
	userRepo     *repository.UserRepository
	jwtSecret    string
	validate     *validator.Validate
	hub          WebSocketHub
	scheduler    *scheduler.Scheduler
	cfg          *config.Config
}

type WebSocketHub interface {
	BroadcastToRun(runID string, data interface{})
}

func NewHandler(
	workflowRepo *repository.WorkflowRepository,
	webhookRepo *repository.WebhookRepository,
	userRepo *repository.UserRepository,
	jwtSecret string,
	hub WebSocketHub,
	sched *scheduler.Scheduler,
	cfg *config.Config,
) *Handler {
	return &Handler{
		workflowRepo: workflowRepo,
		webhookRepo:  webhookRepo,
		userRepo:     userRepo,
		jwtSecret:    jwtSecret,
		validate:     validator.New(),
		hub:          hub,
		scheduler:    sched,
		cfg:          cfg,
	}
}

type Response struct {
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func successResponse(c *gin.Context, code int, data interface{}) {
	c.JSON(code, Response{Data: data})
}

func errorResponse(c *gin.Context, code int, msg string) {
	c.JSON(code, Response{Error: msg})
}
