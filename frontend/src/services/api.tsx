import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

// ─── Key converters ───────────────────────────────────────────────────────────

/** snake_case → camelCase  (applied recursively to all response data) */
function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}
function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelizeKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        toCamel(k),
        camelizeKeys(v),
      ])
    )
  }
  return obj
}

/** camelCase → snake_case  (applied to TOP-LEVEL request body keys only,
 *  so nested user-defined objects like `dag` are left untouched) */
function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}
function snakifyTopLevel(obj: unknown): unknown {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        toSnake(k),
        v,
      ])
    )
  }
  return obj
}

// ─────────────────────────────────────────────────────────────────────────────

const api = axios.create({
  // Use relative path so Vite proxy forwards to the backend in development.
  // In production, set VITE_API_URL to the actual backend origin.
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach JWT + convert camelCase body keys → snake_case
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Only transform structured bodies for mutating methods
  const method = config.method?.toLowerCase() ?? ''
  if (config.data && ['post', 'put', 'patch'].includes(method)) {
    config.data = snakifyTopLevel(config.data)
  }

  return config
})

// Response interceptor — convert snake_case keys → camelCase + handle 401
api.interceptors.response.use(
  (response) => {
    response.data = camelizeKeys(response.data)
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export async function generateWorkflowWithAI(description: string): Promise<{ dag: Record<string, unknown> }> {
  const token = useAuthStore.getState().token
  const resp = await fetch('/api/v1/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ description }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'AI generation failed')
  return data.data
}

export default api
