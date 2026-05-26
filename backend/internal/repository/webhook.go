package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

type WebhookRepository struct {
	db *DB
}

func NewWebhookRepository(db *DB) *WebhookRepository {
	return &WebhookRepository{db: db}
}

// Create inserts a new webhook and sets its generated ID & CreatedAt.
func (r *WebhookRepository) Create(ctx context.Context, w *model.Webhook) error {
	w.ID = uuid.New()
	w.CreatedAt = time.Now()

	query := `
		INSERT INTO webhooks (id, tenant_id, workflow_id, secret, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.ExecContext(ctx, query,
		w.ID, w.TenantID, w.WorkflowID, w.Secret, w.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create webhook: %w", err)
	}
	return nil
}

// GetByID fetches a single webhook by its ID (no tenant check — used by the
// public receive endpoint; ownership is validated via workflow_id → tenant).
func (r *WebhookRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Webhook, error) {
	query := `
		SELECT id, tenant_id, workflow_id, secret, created_at
		FROM webhooks
		WHERE id = $1
	`
	var w model.Webhook
	row := r.db.QueryRowContext(ctx, query, id)
	if err := row.Scan(&w.ID, &w.TenantID, &w.WorkflowID, &w.Secret, &w.CreatedAt); err != nil {
		return nil, fmt.Errorf("get webhook: %w", err)
	}
	return &w, nil
}

// ListByWorkflow returns all webhooks for a given workflow scoped to a tenant.
func (r *WebhookRepository) ListByWorkflow(
	ctx context.Context,
	workflowID uuid.UUID,
	tenantID uuid.UUID,
) ([]model.Webhook, error) {
	query := `
		SELECT id, tenant_id, workflow_id, created_at
		FROM webhooks
		WHERE workflow_id = $1 AND tenant_id = $2
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, workflowID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list webhooks: %w", err)
	}
	defer rows.Close()

	var webhooks []model.Webhook
	for rows.Next() {
		var w model.Webhook
		if err := rows.Scan(&w.ID, &w.TenantID, &w.WorkflowID, &w.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan webhook: %w", err)
		}
		// secret is intentionally omitted from list responses
		webhooks = append(webhooks, w)
	}
	return webhooks, nil
}

// Delete removes a webhook, scoped by tenant to prevent cross-tenant deletion.
func (r *WebhookRepository) Delete(
	ctx context.Context,
	id uuid.UUID,
	tenantID uuid.UUID,
) error {
	query := `DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return fmt.Errorf("delete webhook: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("webhook not found")
	}
	return nil
}
