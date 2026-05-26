package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

type RegisterRequest struct {
	TenantName string     `json:"tenant_name" validate:"required,min=3"`
	TenantSlug string     `json:"tenant_slug" validate:"required,min=3,alphanum"`
	Email      string     `json:"email" validate:"required,email"`
	Password   string     `json:"password" validate:"required,min=6"`
	Role       model.Role `json:"role" validate:"required,oneof=admin editor viewer"`
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if !bindAndValidate(c, &req, h.validate) {
		return
	}

	ctx := c.Request.Context()

	existing, _ := h.userRepo.GetTenantBySlug(ctx, req.TenantSlug)
	if existing != nil {
		c.JSON(http.StatusConflict, Response{Error: "tenant slug already exists"})
		return
	}

	tenant := &model.Tenant{
		Name: req.TenantName,
		Slug: strings.ToLower(req.TenantSlug),
	}
	if err := h.userRepo.CreateTenant(ctx, tenant); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create tenant"})
		return
	}

	user := &model.User{
		TenantID: tenant.ID,
		Email:    req.Email,
		Role:     req.Role,
	}
	if err := h.userRepo.Create(ctx, user, req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create user"})
		return
	}

	token, err := appMiddleware.GenerateToken(
		user.ID.String(), tenant.ID.String(),
		user.Email, user.Role, h.jwtSecret,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to generate token"})
		return
	}

	successResponse(c, http.StatusCreated, model.AuthResponse{
		Token: token,
		User:  *user,
	})
}

func (h *Handler) Login(c *gin.Context) {
	var req struct {
		TenantSlug string `json:"tenant_slug" validate:"required"`
		Email      string `json:"email" validate:"required,email"`
		Password   string `json:"password" validate:"required"`
	}

	if !bindAndValidate(c, &req, h.validate) {
		return
	}

	ctx := c.Request.Context()

	tenant, err := h.userRepo.GetTenantBySlug(ctx, req.TenantSlug)
	if err != nil {
		c.JSON(http.StatusUnauthorized, Response{Error: "invalid credentials"})
		return
	}

	user, err := h.userRepo.GetByEmail(ctx, req.Email, tenant.ID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, Response{Error: "invalid credentials"})
		return
	}

	if !h.userRepo.VerifyPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, Response{Error: "invalid credentials"})
		return
	}

	token, err := appMiddleware.GenerateToken(
		user.ID.String(), tenant.ID.String(),
		user.Email, user.Role, h.jwtSecret,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to generate token"})
		return
	}

	successResponse(c, http.StatusOK, model.AuthResponse{
		Token: token,
		User:  *user,
	})
}

func (h *Handler) Me(c *gin.Context) {
	userID := appMiddleware.GetUserID(c)

	id, err := parseUUID(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid user id"})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "user not found"})
		return
	}

	successResponse(c, http.StatusOK, user)
}