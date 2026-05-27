import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import type {
  WorkflowDefinition,
  WorkflowRun,
  HealthMetrics,
  PaginatedResponse,
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
      const { data } = await api.post<{ data: { run_id: string } }>(
        `/workflows/${workflowId}/trigger`
      )
      return data.data
    },

    onMutate: async (workflowId) => {
      await qc.cancelQueries({ queryKey: ['runs', workflowId] })

      // Snapshot current runs
      const snapshots = qc.getQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] }
      )

      // Build a temporary run entry with a client-side id
      const optimisticRun: WorkflowRun = {
        id: `optimistic-${Date.now()}`,
        workflowId,
        tenantId: '',
        status: 'pending',
        triggerType: 'manual',
        createdAt: new Date().toISOString(),
      }

      // Prepend it to every cached page-1 result
      qc.setQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            data: [optimisticRun, ...old.data],
            total: old.total + 1,
          }
        }
      )

      return { snapshots, optimisticRun }
    },

    onSuccess: (result, workflowId, ctx) => {
      // Swap the placeholder id with the real run_id from the server
      qc.setQueriesData<PaginatedResponse<WorkflowRun>>(
        { queryKey: ['runs', workflowId] },
        (old) => {
          if (!old || !ctx) return old
          return {
            ...old,
            data: old.data.map((r) =>
              r.id === ctx.optimisticRun.id
                ? { ...r, id: result.run_id, status: 'running' as const }
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
      qc.invalidateQueries({ queryKey: ['runs', workflowId] })
    },
  })
}

export function useWorkflowRuns(workflowId: string, page = 1) {
  return useQuery({
    queryKey: ['runs', workflowId, page],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WorkflowRun>>(
        `/workflows/${workflowId}/runs?page=${page}&limit=20`
      )
      return data
    },
    enabled: !!workflowId && workflowId !== 'new',
    refetchInterval: 5000,
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
