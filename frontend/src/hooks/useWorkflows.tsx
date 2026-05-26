import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import type {
  WorkflowDefinition,
  WorkflowRun,
  HealthMetrics,
  PaginatedResponse,
} from '@/types'

export function useWorkflows(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['workflows', page, limit],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<WorkflowDefinition>>(
        `/workflows?page=${page}&limit=${limit}`
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

export function useUpdateWorkflow(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<WorkflowDefinition>) => {
      const { data } = await api.put<{ data: WorkflowDefinition }>(
        `/workflows/${id}`, payload
      )
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflow', id] })
    },
  })
}

export function useDeleteWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workflows/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useTriggerWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ data: { run_id: string } }>(
        `/workflows/${id}/trigger`
      )
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
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