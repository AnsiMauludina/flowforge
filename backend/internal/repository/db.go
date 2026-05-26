package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// DB wraps sqlx.DB
type DB struct {
	*sqlx.DB
}

// NewDB creates a new database connection with retry
func NewDB(dsn string) (*DB, error) {
	var db *sqlx.DB
	var err error

	// Retry connection up to 5 times
	for i := 0; i < 5; i++ {
		db, err = sqlx.Connect("postgres", dsn)
		if err == nil {
			break
		}
		fmt.Printf("DB connection attempt %d failed: %v\n", i+1, err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %w", err)
	}

	fmt.Println("✅ Database connected successfully")
	return &DB{db}, nil
}

// RunMigrations runs SQL migration files
func (db *DB) RunMigrations(migrationSQL string) error {
	_, err := db.Exec(migrationSQL)
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}
	fmt.Println("✅ Migrations completed")
	return nil
}

// MarshalJSON helper for JSONB fields
func MarshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

// UnmarshalJSON helper for JSONB fields
func UnmarshalJSON(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}