package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/AnsiMauludina/flowforge/config"
	"github.com/AnsiMauludina/flowforge/internal/repository"
)

func main() {
	// Load config
	cfg := config.Load()

	// Connect database
	db, err := repository.NewDB(cfg.DBUrl)
	if err != nil {
		fmt.Printf("❌ Failed to connect DB: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Run migrations
	migrationSQL, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		fmt.Printf("❌ Failed to read migration: %v\n", err)
		os.Exit(1)
	}
	if err := db.RunMigrations(string(migrationSQL)); err != nil {
		fmt.Printf("❌ Migration failed: %v\n", err)
		os.Exit(1)
	}

	// Setup Echo
	e := echo.New()
	e.HideBanner = true

	// Global middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3000"},
		AllowMethods: []string{
			http.MethodGet, http.MethodPost,
			http.MethodPut, http.MethodDelete,
		},
		AllowHeaders: []string{
			echo.HeaderContentType,
			echo.HeaderAuthorization,
		},
	}))

	// Rate limiter
	e.Use(middleware.RateLimiter(
		middleware.NewRateLimiterMemoryStore(20),
	))

	// Health check
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status":  "ok",
			"version": "1.0.0",
		})
	})

	// API v1 routes (handlers added next)
	v1 := e.Group("/api/v1")
	_ = v1

	fmt.Printf("🚀 FlowForge API running on port %s\n", cfg.Port)

	// Graceful shutdown
	go func() {
		if err := e.Start(":" + cfg.Port); err != nil &&
			err != http.ErrServerClosed {
			fmt.Printf("❌ Server error: %v\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("⏳ Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		fmt.Printf("❌ Shutdown error: %v\n", err)
	}
	fmt.Println("✅ Server stopped")
}