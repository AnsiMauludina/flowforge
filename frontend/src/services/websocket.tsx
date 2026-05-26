import type { WSMessage, StepRun, WorkflowRun } from '@/types'
import { useWorkflowStore } from '@/store/workflowStore'

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private currentToken = ''
  private currentRunID: string | undefined

  connect(token: string, runID?: string) {
    this.currentToken = token
    this.currentRunID = runID

    // Build URL: in dev, use relative path so Vite proxy forwards it.
    // In production (VITE_WS_URL is set), use the explicit base.
    const wsBase = import.meta.env.VITE_WS_URL
      ? import.meta.env.VITE_WS_URL
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1`

    const params = new URLSearchParams({ token })
    if (runID) params.set('run_id', runID)
    const url = `${wsBase}/ws?${params.toString()}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected')
      this.reconnectDelay = 1000
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
      this.scheduleReconnect()
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

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay,
      )
      this.connect(this.currentToken, this.currentRunID)
    }, this.reconnectDelay)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.ws = null
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsService = new WebSocketService()
