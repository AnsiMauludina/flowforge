import type { WSMessage, StepRun, WorkflowRun } from '@/types'
import { useWorkflowStore } from '@/store/workflowStore'

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private currentToken = ''
  private currentRunID: string | undefined
  // Flag to distinguish intentional close (disconnect()) from network drop.
  // Prevents scheduleReconnect() from firing after an explicit disconnect.
  private intentionalClose = false

  connect(token: string, runID?: string) {
    // If already connected to the same target, skip re-connecting
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.currentToken === token &&
      this.currentRunID === runID
    ) {
      return
    }

    this.intentionalClose = false
    this.currentToken = token
    this.currentRunID = runID

    // Close any existing socket cleanly before opening a new one
    if (this.ws) {
      this.intentionalClose = true
      this.ws.close()
      this.ws = null
    }
    this.intentionalClose = false

    const wsBase = import.meta.env.VITE_WS_URL
      ? import.meta.env.VITE_WS_URL
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1`

    const params = new URLSearchParams({ token })
    if (runID) params.set('run_id', runID)

    this.ws = new WebSocket(`${wsBase}/ws?${params.toString()}`)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        this.handleMessage(msg)
      } catch {
        // ignore malformed frames
      }
    }

    this.ws.onclose = () => {
      // Only reconnect on unintentional closes (network drop, server restart)
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onerror always precedes onclose; let onclose handle reconnect logic
    }
  }

  private handleMessage(msg: WSMessage) {
    const store = useWorkflowStore.getState()

    switch (msg.type) {
      case 'step_update':
        store.updateStepRun(msg.data as StepRun)
        break
      case 'run_update':
        if (store.activeRun?.id === msg.runId) {
          store.setActiveRun({
            ...store.activeRun,
            ...(msg.data as Partial<WorkflowRun>),
          })
        }
        break
      case 'run_complete':
        store.setActiveRun({
          ...store.activeRun!,
          status: (msg.data as WorkflowRun).status,
        })
        break
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay,
      )
      if (!this.intentionalClose && this.currentToken) {
        this.connect(this.currentToken, this.currentRunID)
      }
    }, this.reconnectDelay)
  }

  disconnect() {
    // Mark as intentional BEFORE closing so onclose doesn't trigger reconnect
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsService = new WebSocketService()
