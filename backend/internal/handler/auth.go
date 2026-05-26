package handler

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

type RegisterRequest struct {
	TenantName string     `json:"tenant_name" validate:"required,min=3"`
	TenantSlug string     `json:"tenant_slug" validate:"required,min=3,alphanum"`
	Email      string     `json:"email" validate:"required,email"`
	Password   string     `json:"password" validate:"required,min=6"`
	Role       model.Role `json:"role" validate:"required,oneof=admin editor viewer"`
}

// Register creates a new tenant + admin user
func (h *Handler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()

	// Check if slug already exists
	existing, _ := h.userRepo.GetTenantBySlug(ctx, req.TenantSlug)
	if existing != nil {
		return echo.NewHTTPError(http.StatusConflict, "tenant slug already exists")
	}

	// Create tenant
	tenant := &model.Tenant{
		Name: req.TenantName,
		Slug: strings.ToLower(req.TenantSlug),
	}
	if err := h.userRepo.CreateTenant(ctx, tenant); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create tenant")
	}

	// Create user
	user := &model.User{
		TenantID: tenant.ID,
		Email:    req.Email,
		Role:     req.Role,
	}
	if err := h.userRepo.Create(ctx, user, req.Password); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create user")
	}

	// Generate token
	token, err := middleware.GenerateToken(
		user.ID.String(),
		tenant.ID.String(),
		user.Email,
		user.Role,
		h.jwtSecret,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}

	return c.JSON(http.StatusCreated, successResponse(model.AuthResponse{
		Token: token,
		User:  *user,
	}))
}

// Login authenticates a user
func (h *Handler) Login(c echo.Context) error {
	var req struct {
		TenantSlug string `json:"tenant_slug" validate:"required"`
		Email      string `json:"email" validate:"required,email"`
		Password   string `json:"password" validate:"required"`
	}

	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()

	// Get tenant
	tenant, err := h.userRepo.GetTenantBySlug(ctx, req.TenantSlug)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	// Get user
	user, err := h.userRepo.GetByEmail(ctx, req.Email, tenant.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	// Verify password
	if !h.userRepo.VerifyPassword(user.PasswordHash, req.Password) {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	// Generate token
	token, err := middleware.GenerateToken(
		user.ID.String(),
		tenant.ID.String(),
		user.Email,
		user.Role,
		h.jwtSecret,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}

	return c.JSON(http.StatusOK, successResponse(model.AuthResponse{
		Token: token,
		User:  *user,
	}))
}

// Me returns current user info
func (h *Handler) Me(c echo.Context) error {
	userID := middleware.GetUserID(c)

	ctx := c.Request().Context()

	// Parse UUID
	from, err := parseUUID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid user id")
	}

	user, err := h.userRepo.GetByID(ctx, from)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}

	return c.JSON(http.StatusOK, successResponse(user))
}