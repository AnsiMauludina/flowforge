export type Role = 'admin' | 'editor' | 'viewer'
export type StepType = 'http' | 'script' | 'javascript' | 'delay' | 'condition'
export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'
export type TriggerType = 'manual' | 'scheduled' | 'webhook'

export interface Tenant {
  id: string
  name: string
  slug: string
}

export interface User {
  id: string
  email: string
  role: Role
  tenantId: string
}

export interface StepDefinition {
  id: string
  name: string
  type: StepType
  config: Record<string, unknown>
  dependencies: string[]
  retryConfig?: {
    maxRetries: number
    backoffMultiplier: number
  }
}

export interface DAGDefinition {
  steps: StepDefinition[]
  timeout?: number
}

export interface WorkflowDefinition {
  id: string
  tenantId: string
  name: string
  description?: string
  dag: DAGDefinition
  version: number
  isActive: boolean
  cronExpression?: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  version: number
  dag: DAGDefinition
  createdAt: string
}

export interface WorkflowRun {
  id: string
  workflowId: string
  tenantId: string
  status: RunStatus
  triggerType: TriggerType
  startedAt?: string
  finishedAt?: string
  createdAt: string
}

export interface StepRun {
  id: string
  runId: string
  stepId: string
  stepName?: string
  status: StepStatus
  attempt: number
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface HealthMetrics {
  activeRuns: number
  successRate: number
  failureRate: number
  avgExecutionTime: number
  totalRuns24h: number
}

export interface WSMessage {
  type: 'step_update' | 'run_update' | 'run_complete'
  runId: string
  data: Partial<StepRun> | Partial<WorkflowRun>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface AuthResponse {
  token: string
  user: User
}

export interface FailureAnalysis {
  diagnosis: string
  suggestedFix: string
}

export interface ScheduleSuggestion {
  cron: string
  label: string
  reason: string
}
