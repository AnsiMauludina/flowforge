package websocket

import (
	"encoding/json"
	"sync"
)

// Message types
const (
	MsgTypeStepUpdate  = "step_update"
	MsgTypeRunUpdate   = "run_update"
	MsgTypeRunComplete = "run_complete"
)

// WSMessage is sent to frontend clients
type WSMessage struct {
	Type   string      `json:"type"`
	RunID  string      `json:"run_id"`
	Data   interface{} `json:"data"`
}

// Hub manages all WebSocket connections
// Supports broadcasting to specific runs or all clients
type Hub struct {
	mu sync.RWMutex

	// All connected clients
	clients map[*Client]bool

	// runID -> set of clients watching that run
	runClients map[string]map[*Client]bool

	// tenantID -> set of clients
	tenantClients map[string]map[*Client]bool

	// Channel for registering clients
	register chan *Client

	// Channel for unregistering clients
	unregister chan *Client

	// Channel for broadcasting messages
	broadcast chan *broadcastMsg
}

type broadcastMsg struct {
	runID    string
	tenantID string
	message  []byte
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:       make(map[*Client]bool),
		runClients:    make(map[string]map[*Client]bool),
		tenantClients: make(map[string]map[*Client]bool),
		register:      make(chan *Client, 256),
		unregister:    make(chan *Client, 256),
		broadcast:     make(chan *broadcastMsg, 256),
	}
}

// Run starts the hub event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case msg := <-h.broadcast:
			h.broadcastMessage(msg)
		}
	}
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[client] = true

	// Register to tenant group
	if client.tenantID != "" {
		if h.tenantClients[client.tenantID] == nil {
			h.tenantClients[client.tenantID] = make(map[*Client]bool)
		}
		h.tenantClients[client.tenantID][client] = true
	}

	// Register to run group if watching a run
	if client.runID != "" {
		if h.runClients[client.runID] == nil {
			h.runClients[client.runID] = make(map[*Client]bool)
		}
		h.runClients[client.runID][client] = true
	}
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)
	close(client.send)

	// Remove from tenant group
	if client.tenantID != "" {
		delete(h.tenantClients[client.tenantID], client)
		if len(h.tenantClients[client.tenantID]) == 0 {
			delete(h.tenantClients, client.tenantID)
		}
	}

	// Remove from run group
	if client.runID != "" {
		delete(h.runClients[client.runID], client)
		if len(h.runClients[client.runID]) == 0 {
			delete(h.runClients, client.runID)
		}
	}
}

func (h *Hub) broadcastMessage(msg *broadcastMsg) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var targets map[*Client]bool

	if msg.runID != "" {
		// Broadcast to specific run watchers
		targets = h.runClients[msg.runID]
	} else if msg.tenantID != "" {
		// Broadcast to all tenant clients
		targets = h.tenantClients[msg.tenantID]
	} else {
		// Broadcast to all clients
		targets = h.clients
	}

	for client := range targets {
		select {
		case client.send <- msg.message:
		default:
			// Client send buffer full, disconnect
			go func(c *Client) {
				h.unregister <- c
			}(client)
		}
	}
}

// BroadcastToRun sends a message to all clients watching a run
func (h *Hub) BroadcastToRun(runID string, data interface{}) {
	msg := WSMessage{
		Type:  MsgTypeStepUpdate,
		RunID: runID,
		Data:  data,
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.broadcast <- &broadcastMsg{
		runID:   runID,
		message: msgBytes,
	}
}

// BroadcastRunStatus sends run status update to tenant clients
func (h *Hub) BroadcastRunStatus(
	tenantID string,
	runID string,
	status string,
) {
	msg := WSMessage{
		Type:  MsgTypeRunUpdate,
		RunID: runID,
		Data: map[string]string{
			"run_id": runID,
			"status": status,
		},
	}
	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.broadcast <- &broadcastMsg{
		tenantID: tenantID,
		message:  msgBytes,
	}
}

// BroadcastRunComplete sends run complete to all watchers
func (h *Hub) BroadcastRunComplete(runID string, status string) {
	msg := WSMessage{
		Type:  MsgTypeRunComplete,
		RunID: runID,
		Data: map[string]string{
			"run_id": runID,
			"status": status,
		},
	}
	msgBytes, _ := json.Marshal(msg)
	h.broadcast <- &broadcastMsg{
		runID:   runID,
		message: msgBytes,
	}
}

// GetConnectedCount returns total connected clients
func (h *Hub) GetConnectedCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}