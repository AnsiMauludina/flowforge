import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import duration from 'dayjs/plugin/duration'
import Badge from '@/components/ui/Badge'
import type { WorkflowRun } from '@/types'

dayjs.extend(relativeTime)
dayjs.extend(duration)

interface RunHistoryProps {
  runs: WorkflowRun[]
  onSelectRun?: (run: WorkflowRun) => void
  selectedRunId?: string
}

function getDuration(run: WorkflowRun) {
  if (!run.startedAt || !run.finishedAt) return '—'
  const ms = dayjs(run.finishedAt).diff(dayjs(run.startedAt))
  const d = dayjs.duration(ms)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${d.seconds()}s`
  return `${Math.floor(d.asMinutes())}m ${d.seconds()}s`
}

export default function RunHistory({ runs, onSelectRun, selectedRunId }: RunHistoryProps) {
  if (!runs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-gray-400">No runs yet</p>
      </div>
    )
  }

  return (
    <div>
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => onSelectRun?.(run)}
          className={`
            flex items-center justify-between px-4 py-3 cursor-pointer
            border-b border-gray-50 last:border-0
            hover:bg-slate-50/70 transition-colors
            ${selectedRunId === run.id ? 'bg-indigo-50/60 border-l-2 border-l-indigo-500' : ''}
          `}
        >
          <div className="flex items-center gap-3">
            <Badge status={run.status} />
            <div>
              <p className="text-xs font-medium text-gray-700 capitalize">
                {run.triggerType} trigger
              </p>
              <p className="text-xs text-gray-400">{dayjs(run.createdAt).fromNow()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">{getDuration(run)}</p>
            <p className="text-xs text-gray-300 font-mono">{run.id.slice(0, 8)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
