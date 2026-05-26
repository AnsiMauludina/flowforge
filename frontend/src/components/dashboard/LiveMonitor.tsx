import { useEffect } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import Badge from '@/components/ui/Badge'
import type { WorkflowRun } from '@/types'

interface LiveMonitorProps {
  run: WorkflowRun
}

export default function LiveMonitor({ run }: LiveMonitorProps) {
  const { stepRuns, setActiveRun } = useWorkflowStore()
  useWebSocket(run.id)

  useEffect(() => {
    setActiveRun(run)
    return () => setActiveRun(null)
  }, [run.id])

  const steps = Object.values(stepRuns)

  return (
    <div className="space-y-2">
      {/* Run status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500">
          Run {run.id.slice(0, 8)}...
        </span>
        <Badge status={run.status} />
      </div>

      {/* Steps */}
      {!steps.length ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          Waiting for steps...
        </div>
      ) : (
        steps.map((step) => (
          <div
            key={step.stepId}
            className={`
              flex items-center justify-between p-3 rounded-lg border
              ${step.status === 'running' ? 'bg-blue-50 border-blue-200' : ''}
              ${step.status === 'success' ? 'bg-green-50 border-green-200' : ''}
              ${step.status === 'failed'  ? 'bg-red-50 border-red-200' : ''}
              ${step.status === 'pending' ? 'bg-gray-50 border-gray-200' : ''}
            `}
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {step.stepName || step.stepId}
              </p>
              {step.error && (
                <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]">
                  {step.error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step.attempt > 1 && (
                <span className="text-xs text-gray-400">
                  #{step.attempt}
                </span>
              )}
              <Badge status={step.status as 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}