import type { WSMessage, StepRun, WorkflowRun } from '@/types'
import { useWorkflowStore } from '@/store/workflowStore'

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private url = ''

  connect(token: string, runID?: string) {
    const base = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/api/v1'
    this.url = `${base}/ws${runID ? `?run_id=${runID}` : ''}`

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected')
      this.reconnectDelay = 1000
      // Send auth token
      this.ws?.send(JSON.stringify({ type: 'auth', token }))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        this.handleMessage(msg)
      } catch (e) {
        console.error('WS parse error', e)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...')
      this.scheduleReconnect(token, runID)
    }

    this.ws.onerror = (err) => {
      console.error('WebSocket error', err)
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

  private scheduleReconnect(token: string, runID?: string) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      )
      this.connect(token, runID)
    }, this.reconnectDelay)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsService = new WebSocketService()