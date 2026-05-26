import { useEffect } from 'react'
import { wsService } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'

export function useWebSocket(runID?: string) {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    wsService.connect(token, runID)

    return () => {
      wsService.disconnect()
    }
  }, [token, runID])

  return { isConnected: wsService.isConnected() }
}