import { create } from 'zustand'
import type {
  WorkflowDefinition,
  WorkflowRun,
  StepRun,
  HealthMetrics,
} from '@/types'

interface WorkflowState {
  workflows: WorkflowDefinition[]
  activeRun: WorkflowRun | null
  stepRuns: Record<string, StepRun>
  metrics: HealthMetrics | null

  setWorkflows: (workflows: WorkflowDefinition[]) => void
  setActiveRun: (run: WorkflowRun | null) => void
  updateStepRun: (stepRun: StepRun) => void
  setMetrics: (metrics: HealthMetrics) => void
  resetRun: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  activeRun: null,
  stepRuns: {},
  metrics: null,

  setWorkflows: (workflows) => set({ workflows }),

  setActiveRun: (run) => set({ activeRun: run, stepRuns: {} }),

  updateStepRun: (stepRun) =>
    set((state) => ({
      stepRuns: {
        ...state.stepRuns,
        [stepRun.stepId]: stepRun,
      },
    })),

  setMetrics: (metrics) => set({ metrics }),

  resetRun: () => set({ activeRun: null, stepRuns: {} }),
}))