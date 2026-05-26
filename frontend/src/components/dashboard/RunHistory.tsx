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

export default function RunHistory({
  runs,
  onSelectRun,
  selectedRunId,
}: RunHistoryProps) {
  if (!runs.length) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No runs yet
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => onSelectRun?.(run)}
          className={`
            flex items-center justify-between px-4 py-3 cursor-pointer
            hover:bg-gray-50 transition-colors
            ${selectedRunId === run.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}
          `}
        >
          <div className="flex items-center gap-3">
            <Badge status={run.status} />
            <div>
              <p className="text-xs font-medium text-gray-700 capitalize">
                {run.triggerType} trigger
              </p>
              <p className="text-xs text-gray-400">
                {dayjs(run.createdAt).fromNow()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{getDuration(run)}</p>
            <p className="text-xs text-gray-400 font-mono truncate max-w-[80px]">
              {run.id.slice(0, 8)}...
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}