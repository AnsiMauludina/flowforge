import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import type {
  WorkflowDefinition,
  WorkflowRun,
  HealthMetrics,
  PaginatedResponse,
  FailureAnalysis,
  ScheduleSuggestion,
} from '@/types'

export interface WorkflowFilter {
  name?: string
  is_active?: 'true' | 'false' | ''
}

export function useWorkflows(page = 1, limit = 20, filter: WorkflowFilter = {}) {
  return useQuery({
    queryKey: ['workflows', page, limit, filter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (filter.name) params.set('name', filter.name)
      if (filter.is_active) params.set('is_active', filter.is_active)
      const { data } = await api.get<PaginatedResponse<WorkflowDefinition>>(
        `/workflows?${params.toString()}`
      )
      return data
    },
  })
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: WorkflowDefinition }>(
        `/workflows/${id}`
      )
      return data.data
    },
    enabled: !!id && id !== 'new',
  })
}

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<WorkflowDefinition>) => {
      const { data } = await api.post<{ data: WorkflowDefinition }>(
        '/workflows', payload
      )
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

// ─── useUpdateWorkflow ────────────────────────────────────────────────────────
// Optimistic: immediately reflects the new name/description/cron in the detail
// view while the PUT is in-flight. Rolls back on error.
export function useUpdateWorkflow(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Partial<WorkflowDefinition>) => {
      const { data } = await api.put<{ data: WorkflowDefinition }>(
        `/workflows/${id}`, payload
      )
      return data.data
    },

    onMutate: async (payload) => {
      // Cancel in-flight refetches so they don't clobber our optimistic data
      await qc.cancelQueries({ queryKey: ['workflow', id] })

      const snapshot = qc.getQueryData<WorkflowDefinition>(['workflow', id])

      // Apply optimistic update to the detail cache
      qc.setQueryData<WorkflowDefinition>(['workflow', id], (old) =>
        old ? { ...old, ...payload } : old
      )

      return { snapshot }
    },

    onError: (_err, _payload, ctx) => {
      // Restore snapshot so UI snaps back
      if (ctx?.snapshot) {
        qc.setQueryData(['workflow', id], ctx.snapshot)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workflow', id] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

// ─── useDeleteWorkflow ────────────────────────────────────────────────────────
// Optimistic: instantly removes the row from every cached page of the workflow
// list. Shows a rollback (the row reappears) if the request fails.
export function useDeleteWorkflow() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workflows/${id}`)
    },

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['workflows'] })

      // Snapshot ALL pages that are currently cached
      const snapshots = qc.getQueriesData<PaginatedResponse<WorkflowDefinition>>(
        { queryKey: ['workflows'] }
      )

      // Remove the workflow from every cached page and decrement total
      qc.setQueriesData<PaginatedResponse<WorkflowDefinition>>(
        { queryKey: ['workflows'] },
        (old) => {
          if (!old) return old
          const filtered = old.data.filter((wf) => wf.id !== id)
          return {
            ...old,
            data: filtered,
            total: Math.max(0, old.total - 1),
          }
        }
      )

      return { snapshots }
    },

    onError: (_err, _id, ctx) => {
      // Restore every page to its previous state
      ctx?.snapshots.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
    },

    onSettled: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

// ─── useTriggerWorkflow ───────────────────────────────────────────────────────
// Optimistic: immediately prepends a "pending" run to the run-history list so
// the user sees instant feedback. Replaced with the real run once the server
// responds; rolled back if the request fails.
export function useTriggerWorkflow() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      // After the camelCase response interceptor, backend's `run_id` arrives
      // as `runId`. The TypeScript type must match what the interceptor produces.
      const { data } = await api.post<{ data: { runId: string } }>(
        `/workflows/${workflowId}/trigger`
      )
      return data.data
    },

    onMutate: async (workflowId) => {
      // Cancel any in-flight runs fetch to prevent it from overriding the
      // optimistic entry. Empty-cache case is handled by `old ?? {...}` below.
      await qc.cancelQueries({ queryKey: ['runs', workflowId] })

      const snapshots = qc.getQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] }
      )

      const optimisticRun: WorkflowRun = {
        id: `optimistic-${Date.now()}`,
        workflowId,
        tenantId: '',
        status: 'pending',
        triggerType: 'manual',
        createdAt: new Date().toISOString(),
      }

      // Handle both: already-cached data AND empty cache (old = undefined).
      // Returning undefined from the updater is a no-op in React Query, so we
      // must always return a valid object.
      qc.setQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] },
        (old) => {
          const base = old ?? { data: [], total: 0, page: 1, limit: 20 }
          return {
            ...base,
            data: [optimisticRun, ...base.data],
            total: base.total + 1,
          }
        }
      )

      return { snapshots, optimisticRun }
    },

    onSuccess: (result, workflowId, ctx) => {
      // Replace the optimistic placeholder with the real run_id from the server.
      // `result.runId` is the camelCase form after the response interceptor.
      qc.setQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] },
        (old) => {
          if (!old || !ctx) return old
          return {
            ...old,
            data: old.data.map((r) =>
              r.id === ctx.optimisticRun.id
                ? { ...r, id: result.runId, status: 'running' as const }
                : r
            ),
          }
        }
      )
    },

    onError: (_err, _workflowId, ctx) => {
      ctx?.snapshots.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
    },

    onSettled: (_data, _err, workflowId) => {
      qc.refetchQueries({ queryKey: ['runs', workflowId] })
    },
  })
}

// Fetches all step runs for a completed or in-progress run from the REST API.
// Used by LiveMonitor to hydrate historical runs that are no longer broadcasting
// via WebSocket.
export function useRunSteps(runId: string | undefined) {
  return useQuery({
    queryKey: ['run-steps', runId],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: import('@/types').StepRun[] }>(
          `/runs/${runId}/steps`
        )
        return data.data ?? []
      } catch {
        // Gracefully return empty on any error (e.g. 404 if backend is not yet
        // restarted). The WebSocket store will still provide live updates.
        return [] as import('@/types').StepRun[]
      }
    },
    enabled: !!runId && runId !== '' && !runId.startsWith('optimistic-'),
    // Refresh while the run is active; stop once all steps are terminal
    refetchInterval: (query) => {
      const steps = query.state.data
      if (!steps?.length) return 3000
      const allDone = steps.every(
        (s) => s.status === 'success' || s.status === 'failed' || s.status === 'skipped'
      )
      return allDone ? false : 3000
    },
  })
}

export function useWorkflowRuns(workflowId: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['runs', workflowId, page, limit],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WorkflowRun>>(
        `/workflows/${workflowId}/runs?page=${page}&limit=${limit}`
      )
      return data
    },
    enabled: !!workflowId && workflowId !== 'new',
    refetchInterval: 5000,
  })
}

export function useWorkflowVersions(id: string) {
  return useQuery({
    queryKey: ['workflow-versions', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: import('@/types').WorkflowVersion[] }>(
        `/workflows/${id}/versions`
      )
      return data.data ?? []
    },
    enabled: !!id && id !== 'new',
  })
}

export function useRollbackWorkflow(workflowId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (version: number) => {
      const { data } = await api.post<{ data: import('@/types').WorkflowDefinition }>(
        `/workflows/${workflowId}/rollback/${version}`
      )
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] })
      qc.invalidateQueries({ queryKey: ['workflow-versions', workflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useHealthMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const { data } = await api.get<{ data: HealthMetrics }>('/metrics')
      return data.data
    },
    refetchInterval: 10000,
  })
}

// Sends a failed run to Claude for root-cause diagnosis + suggested fix.
export function useAnalyzeRun() {
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post<{ data: FailureAnalysis }>(`/runs/${runId}/analyze`)
      return data.data
    },
  })
}

// Asks Claude to suggest optimal cron schedules based on historical run patterns.
export function useScheduleSuggestions() {
  return useMutation({
    mutationFn: async (params: { workflowId?: string; description?: string }) => {
      const { data } = await api.post<{ data: { suggestions: ScheduleSuggestion[] } }>(
        '/ai/schedule',
        params
      )
      return data.data.suggestions
    },
  })
}
