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
	CheckOrigin: func(r *http.Request) bool {
		// Allow localhost in development
		origin := r.Header.Get("Origin")
		return origin == "http://localhost:3000" ||
			origin == "http://localhost:5173"
	},
}

// ServeWS handles WebSocket connections
// GET /api/v1/ws?run_id=<optional>
func (h *Handler) ServeWS(c *gin.Context) {
	if h.hub == nil {
		c.JSON(http.StatusServiceUnavailable,
			Response{Error: "websocket hub not initialized"})
		return
	}

	tenantID := appMiddleware.GetTenantID(c)
	userID := appMiddleware.GetUserID(c)
	runID := c.Query("run_id") // optional — watch specific run

	// Upgrade HTTP to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	// Create client
	hub := h.hub.(*appWS.Hub)
	client := appWS.NewClient(hub, conn, tenantID, userID, runID)

	// Register client
	hub.Register(client)

	// Start read/write pumps
	go client.WritePump()
	go client.ReadPump()
}