package handler

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	appWS "github.com/AnsiMauludina/flowforge/internal/websocket"
)

// allowedOrigins returns the set of permitted WebSocket origins.
// In development (ENV != production) we allow any localhost/127.0.0.1 origin.
// In production, only the value of ALLOWED_ORIGIN env var is accepted.
func allowedOrigin(origin string) bool {
	if os.Getenv("ENV") != "production" {
		// Allow any localhost or loopback origin, and empty Origin headers
		// (sent by non-browser clients, curl, Postman, etc.)
		return origin == "" ||
			strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "https://localhost") ||
			strings.HasPrefix(origin, "http://127.0.0.1") ||
			strings.HasPrefix(origin, "https://127.0.0.1")
	}
	allowed := os.Getenv("ALLOWED_ORIGIN")
	return allowed != "" && origin == allowed
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return allowedOrigin(r.Header.Get("Origin"))
	},
}

// ServeWS handles WebSocket connections.
// GET /api/v1/ws?token=<jwt>&run_id=<optional>
//
// Browsers cannot send Authorization headers during the WebSocket upgrade
// handshake, so the JWT is passed as the ?token query parameter instead.
func (h *Handler) ServeWS(c *gin.Context) {
	if h.hub == nil {
		c.JSON(http.StatusServiceUnavailable,
			Response{Error: "websocket hub not initialized"})
		return
	}

	// Validate token from query param
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, Response{Error: "missing token"})
		return
	}

	claims, err := appMiddleware.ParseToken(tokenStr, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, Response{Error: "invalid or expired token"})
		return
	}

	tenantID := claims.TenantID
	userID := claims.UserID
	runID := c.Query("run_id")

	// Upgrade HTTP → WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// Upgrader already writes the error response
		return
	}

	hub := h.hub.(*appWS.Hub)
	client := appWS.NewClient(hub, conn, tenantID, userID, runID)
	hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}
