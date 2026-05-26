package websocket

import (
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

// Client represents a connected WebSocket client
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	tenantID string
	runID    string
	userID   string
}

// NewClient creates a new WebSocket client
func NewClient(
	hub *Hub,
	conn *websocket.Conn,
	tenantID string,
	userID string,
	runID string,
) *Client {
	return &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		tenantID: tenantID,
		userID:   userID,
		runID:    runID,
	}
}

// ReadPump pumps messages from WebSocket to hub
// Runs in its own goroutine per client
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure,
			) {
				// Log error in production
			}
			break
		}
		// Currently we don't process client messages
		// Could add subscribe/unsubscribe to runs here
	}
}

// WritePump pumps messages from hub to WebSocket
// Runs in its own goroutine per client
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Flush queued messages
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			// Send ping to keep connection alive
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(
				websocket.PingMessage, nil,
			); err != nil {
				return
			}
		}
	}
}