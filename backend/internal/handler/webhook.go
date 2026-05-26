package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

// CreateWebhook — POST /api/v1/workflows/:id/webhooks
// Generates a unique secret and registers a webhook for the given workflow.
// The secret is only returned once — caller must store it.
func (h *Handler) CreateWebhook(c *gin.Context) {
	tenantID, err := parseUUID(appMiddleware.GetTenantID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid tenant id"})
		return
	}
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	// Verify workflow belongs to this tenant
	if _, err := h.workflowRepo.GetByID(c.Request.Context(), workflowID, tenantID); err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "workflow not found"})
		return
	}

	secret, err := generateSecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to generate secret"})
		return
	}

	webhook := &model.Webhook{
		TenantID:   tenantID,
		WorkflowID: workflowID,
		Secret:     secret,
	}
	if err := h.webhookRepo.Create(c.Request.Context(), webhook); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create webhook"})
		return
	}

	successResponse(c, http.StatusCreated, gin.H{
		"id":          webhook.ID,
		"workflow_id": webhook.WorkflowID,
		"secret":      webhook.Secret, // shown only once
		"trigger_url": "/api/v1/webhooks/" + webhook.ID.String() + "/trigger",
		"created_at":  webhook.CreatedAt,
	})
}

// ListWebhooks — GET /api/v1/workflows/:id/webhooks
// Returns all webhooks registered for a workflow (secrets omitted).
func (h *Handler) ListWebhooks(c *gin.Context) {
	tenantID, err := parseUUID(appMiddleware.GetTenantID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid tenant id"})
		return
	}
	workflowID, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid workflow id"})
		return
	}

	webhooks, err := h.webhookRepo.ListByWorkflow(c.Request.Context(), workflowID, tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to list webhooks"})
		return
	}

	successResponse(c, http.StatusOK, webhooks)
}

// DeleteWebhook — DELETE /api/v1/webhooks/:webhook_id
func (h *Handler) DeleteWebhook(c *gin.Context) {
	tenantID, err := parseUUID(appMiddleware.GetTenantID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid tenant id"})
		return
	}
	webhookID, err := parseUUID(c.Param("webhook_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid webhook id"})
		return
	}

	if err := h.webhookRepo.Delete(c.Request.Context(), webhookID, tenantID); err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "webhook not found"})
		return
	}

	c.JSON(http.StatusOK, Response{Message: "webhook deleted"})
}

// ReceiveWebhook — POST /api/v1/webhooks/:webhook_id/trigger  (PUBLIC, no JWT)
//
// The caller must sign the raw request body with the webhook secret using
// HMAC-SHA256 and send it in the header:
//
//	X-Flowforge-Signature: sha256=<hex>
//
// If the signature is valid, the associated workflow is triggered immediately.
func (h *Handler) ReceiveWebhook(c *gin.Context) {
	webhookID, err := parseUUID(c.Param("webhook_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "invalid webhook id"})
		return
	}

	// Read body first so we can verify the HMAC
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{Error: "failed to read request body"})
		return
	}

	webhook, err := h.webhookRepo.GetByID(c.Request.Context(), webhookID)
	if err != nil {
		// Return 404 so callers cannot enumerate webhook IDs
		c.JSON(http.StatusNotFound, Response{Error: "webhook not found"})
		return
	}

	// Verify HMAC-SHA256 signature
	sigHeader := c.GetHeader("X-Flowforge-Signature")
	if !verifySignature(body, webhook.Secret, sigHeader) {
		c.JSON(http.StatusUnauthorized, Response{Error: "invalid signature"})
		return
	}

	// Fetch workflow — use Background context since there is no JWT tenant
	ctx := context.Background()
	workflow, err := h.workflowRepo.GetByID(ctx, webhook.WorkflowID, webhook.TenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{Error: "workflow not found"})
		return
	}

	run := &model.WorkflowRun{
		WorkflowID:  workflow.ID,
		TenantID:    workflow.TenantID,
		Status:      model.RunStatusPending,
		TriggerType: "webhook",
	}
	if err := h.workflowRepo.CreateRun(ctx, run); err != nil {
		c.JSON(http.StatusInternalServerError, Response{Error: "failed to create run"})
		return
	}

	go h.executeWorkflow(run.ID, workflow)

	successResponse(c, http.StatusAccepted, gin.H{
		"run_id":  run.ID,
		"status":  run.Status,
		"message": "workflow triggered via webhook",
	})
}

// --- helpers ---

// generateSecret returns a 32-byte random hex string (256-bit entropy).
func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// verifySignature checks that sigHeader equals "sha256=<hmac(body, secret)>".
// Uses hmac.Equal for constant-time comparison.
func verifySignature(body []byte, secret, sigHeader string) bool {
	const prefix = "sha256="
	if !strings.HasPrefix(sigHeader, prefix) {
		return false
	}
	got, err := hex.DecodeString(strings.TrimPrefix(sigHeader, prefix))
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := mac.Sum(nil)

	return hmac.Equal(got, expected)
}

// parseUUID is already defined in helper.go; declaring here would be a
// duplicate. This file relies on the shared helper.
var _ = uuid.UUID{} // ensure uuid import is used
