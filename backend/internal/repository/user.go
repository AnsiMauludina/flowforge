package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/AnsiMauludina/flowforge/internal/model"
	"golang.org/x/crypto/bcrypt"
)

type UserRepository struct {
	db *DB
}

func NewUserRepository(db *DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(
	ctx context.Context,
	u *model.User,
	password string,
) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	u.ID = uuid.New()
	u.PasswordHash = string(hash)
	u.CreatedAt = time.Now()

	query := `
		INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err = r.db.ExecContext(ctx, query,
		u.ID, u.TenantID, u.Email, u.PasswordHash, u.Role, u.CreatedAt,
	)
	return err
}

func (r *UserRepository) GetByEmail(
	ctx context.Context,
	email string,
	tenantID uuid.UUID,
) (*model.User, error) {
	query := `
		SELECT id, tenant_id, email, password_hash, role, created_at
		FROM users
		WHERE email = $1 AND tenant_id = $2
	`
	var u model.User
	err := r.db.QueryRowContext(ctx, query, email, tenantID).Scan(
		&u.ID, &u.TenantID, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByID(
	ctx context.Context,
	id uuid.UUID,
) (*model.User, error) {
	query := `
		SELECT id, tenant_id, email, password_hash, role, created_at
		FROM users WHERE id = $1
	`
	var u model.User
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.TenantID, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) VerifyPassword(
	hashedPassword string,
	password string,
) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err == nil
}

// CreateTenant creates a new tenant
func (r *UserRepository) CreateTenant(
	ctx context.Context,
	t *model.Tenant,
) error {
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	t.UpdatedAt = time.Now()

	query := `
		INSERT INTO tenants (id, name, slug, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.ExecContext(ctx, query,
		t.ID, t.Name, t.Slug, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (r *UserRepository) GetTenantBySlug(
	ctx context.Context,
	slug string,
) (*model.Tenant, error) {
	query := `
		SELECT id, name, slug, created_at, updated_at
		FROM tenants WHERE slug = $1
	`
	var t model.Tenant
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&t.ID, &t.Name, &t.Slug, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &t, nil
}