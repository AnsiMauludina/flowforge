import { useEffect } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import Badge from '@/components/ui/Badge'
import type { WorkflowRun } from '@/types'

interface LiveMonitorProps {
  run: WorkflowRun
}

const stepBg: Record<string, string> = {
  running: 'bg-indigo-50 border-indigo-100',
  success: 'bg-emerald-50 border-emerald-100',
  failed:  'bg-red-50 border-red-100',
  pending: 'bg-gray-50 border-gray-100',
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
      {/* Run ID */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
          {run.id.slice(0, 12)}...
        </span>
        <Badge status={run.status} />
      </div>

      {/* Steps */}
      {!steps.length ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse mb-3 mx-auto" />
          <p className="text-xs text-gray-400">Waiting for steps...</p>
        </div>
      ) : (
        steps.map((step) => (
          <div
            key={step.stepId}
            className={`
              flex items-center justify-between p-3 rounded-xl border transition-all
              ${stepBg[step.status] ?? stepBg.pending}
            `}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {step.stepName || step.stepId}
              </p>
              {step.error && (
                <p className="text-xs text-red-500 mt-0.5 truncate">{step.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              {step.attempt > 1 && (
                <span className="text-xs text-gray-400">#{step.attempt}</span>
              )}
              <Badge
                status={
                  step.status as
                    | 'pending'
                    | 'running'
                    | 'success'
                    | 'failed'
                    | 'timeout'
                    | 'cancelled'
                }
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
