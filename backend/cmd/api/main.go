package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/requestid"
	"github.com/gin-gonic/gin"
	"github.com/AnsiMauludina/flowforge/config"
	"github.com/AnsiMauludina/flowforge/internal/handler"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	"github.com/AnsiMauludina/flowforge/internal/model"
	"github.com/AnsiMauludina/flowforge/internal/repository"
	appWS "github.com/AnsiMauludina/flowforge/internal/websocket"
)

func main() {
	cfg := config.Load()

	db, err := repository.NewDB(cfg.DBUrl)
	if err != nil {
		fmt.Printf("❌ Failed to connect DB: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	migrationSQL, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		fmt.Printf("❌ Failed to read migration: %v\n", err)
		os.Exit(1)
	}
	if err := db.RunMigrations(string(migrationSQL)); err != nil {
		fmt.Printf("❌ Migration failed: %v\n", err)
		os.Exit(1)
	}

	// Gin setup
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(requestid.New())

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Init repositories & handler
	workflowRepo := repository.NewWorkflowRepository(db)
	userRepo := repository.NewUserRepository(db)

	// Init WebSocket hub
	hub := appWS.NewHub()
	go hub.Run()

	// Pass hub ke handler

	h := handler.NewHandler(workflowRepo, userRepo, cfg.JWTSecret, hub)

	// JWT middleware
	jwtMW := appMiddleware.NewJWTMiddleware(
		appMiddleware.JWTConfig{Secret: cfg.JWTSecret},
	)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"version": "1.0.0",
		})
	})

	// API v1
	v1 := r.Group("/api/v1")

	// Public routes
	auth := v1.Group("/auth")
	auth.POST("/register", h.Register)
	auth.POST("/login", h.Login)

	// Protected routes
	protected := v1.Group("")
	protected.Use(jwtMW, appMiddleware.TenantIsolation())
	{
		// Auth
		protected.GET("/auth/me", h.Me)

		// Workflows
		protected.GET("/workflows", h.ListWorkflows)
		protected.POST("/workflows", h.CreateWorkflow,
			appMiddleware.RequireRole(model.RoleAdmin, model.RoleEditor))
		protected.GET("/workflows/:id", h.GetWorkflow)
		protected.PUT("/workflows/:id", h.UpdateWorkflow,
			appMiddleware.RequireRole(model.RoleAdmin, model.RoleEditor))
		protected.DELETE("/workflows/:id", h.DeleteWorkflow,
			appMiddleware.RequireRole(model.RoleAdmin))
		protected.GET("/workflows/:id/versions", h.GetWorkflowVersions)
		protected.POST("/workflows/:id/trigger", h.TriggerWorkflow,
			appMiddleware.RequireRole(model.RoleAdmin, model.RoleEditor))
		protected.GET("/workflows/:id/runs", h.GetWorkflowRuns)

		// Metrics
		protected.GET("/metrics", h.GetHealthMetrics)

		// WebSocket
		protected.GET("/ws", h.ServeWS)
	}

	// Server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		fmt.Printf("🚀 FlowForge API running on port %s\n", cfg.Port)
		if err := srv.ListenAndServe(); err != nil &&
			err != http.ErrServerClosed {
			fmt.Printf("❌ Server error: %v\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("⏳ Shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		fmt.Printf("❌ Shutdown error: %v\n", err)
	}

	fmt.Println("✅ Server stopped")
}