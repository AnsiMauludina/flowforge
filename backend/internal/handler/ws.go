package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	appMiddleware "github.com/AnsiMauludina/flowforge/internal/middleware"
	appWS "github.com/AnsiMauludina/flowforge/internal/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all localhost origins in development.
	// In production, restrict to the actual frontend domain.
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return origin == "http://localhost:3000" ||
			origin == "http://localhost:5173" ||
			origin == ""
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
