import { useEffect, useRef } from 'react'
import { wsService } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Manages a WebSocket connection for the given runID.
 *
 * - Only opens the socket when `token` is present AND `runID` (if supplied)
 *   is a real UUID — optimistic placeholder IDs ("optimistic-xxx") are ignored
 *   to avoid pointless connect→disconnect cycles.
 * - The socket stays open across re-renders; it is disconnected only when the
 *   component that first opened it unmounts.
 */
export function useWebSocket(runID?: string) {
  const token = useAuthStore((s) => s.token)

  // Track whether the socket was actually opened so cleanup knows what to do
  const connectedRef = useRef(false)

  const isRealRunID = !runID || UUID_RE.test(runID)
  const shouldConnect = !!token && isRealRunID

  useEffect(() => {
    if (!shouldConnect) return

    wsService.connect(token!, runID)
    connectedRef.current = true

    return () => {
      if (connectedRef.current) {
        wsService.disconnect()
        connectedRef.current = false
      }
    }
  }, [token, runID, shouldConnect])

  return { isConnected: wsService.isConnected() }
}
