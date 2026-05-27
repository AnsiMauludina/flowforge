import type { WSMessage, StepRun, WorkflowRun } from '@/types'
import { useWorkflowStore } from '@/store/workflowStore'

// ─── camelizeKeys ─────────────────────────────────────────────────────────────
// WebSocket messages are NOT processed by the axios interceptor, so we need to
// convert snake_case / PascalCase keys ourselves before touching the store.
function camelize(s: string): string {
  // Handle both snake_case  (step_id → stepId)
  // and PascalCase          (StepID → stepID, then stepId via first-char lower)
  const snake = s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
  return snake.charAt(0).toLowerCase() + snake.slice(1)
}

function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelizeKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        camelize(k),
        camelizeKeys(v),
      ])
    )
  }
  return obj
}

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private currentToken = ''
  private currentRunID: string | undefined
  private intentionalClose = false

  connect(token: string, runID?: string) {
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
        const raw = JSON.parse(event.data)
        // camelizeKeys converts snake_case and PascalCase field names from the
        // Go backend (e.g. step_id → stepId, StepID → stepId, run_id → runId)
        const msg = camelizeKeys(raw) as WSMessage
        this.handleMessage(msg)
      } catch {
        // ignore malformed frames
      }
    }

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onerror always precedes onclose; let onclose handle reconnect
    }
  }

  private handleMessage(msg: WSMessage) {
    const store = useWorkflowStore.getState()

    switch (msg.type) {
      case 'step_update': {
        const step = msg.data as StepRun
        // Ignore phantom entries that have no valid step ID
        if (step.stepId) {
          store.updateStepRun(step)
        }
        break
      }
      case 'run_update':
        if (store.activeRun?.id === msg.runId) {
          store.setActiveRun({
            ...store.activeRun,
            ...(msg.data as Partial<WorkflowRun>),
          })
        }
        break
      case 'run_complete':
        if (store.activeRun) {
          store.setActiveRun({
            ...store.activeRun,
            status: (msg.data as WorkflowRun).status,
          })
        }
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
