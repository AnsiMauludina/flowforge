import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Circle,
  Terminal,
  ArrowRight,
  Globe,
  GitBranch,
  Timer,
} from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRunSteps } from '@/hooks/useWorkflows'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import type { WorkflowRun, StepRun, StepStatus, StepType } from '@/types'

dayjs.extend(duration)

interface LiveMonitorProps {
  run: WorkflowRun
  /** Total steps in the workflow DAG — used for an accurate progress counter */
  totalSteps?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'running':  return <Loader2   className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />
    case 'success':  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    case 'failed':   return <AlertCircle  className="w-3.5 h-3.5 text-red-500 shrink-0" />
    case 'skipped':  return <ArrowRight   className="w-3.5 h-3.5 text-gray-400 shrink-0" />
    default:         return <Circle       className="w-3.5 h-3.5 text-gray-300 shrink-0" />
  }
}

const STEP_TYPE_ICON: Partial<Record<StepType, React.ReactNode>> = {
  http:      <Globe     className="w-3 h-3" />,
  script:    <Terminal  className="w-3 h-3" />,
  delay:     <Timer     className="w-3 h-3" />,
  condition: <GitBranch className="w-3 h-3" />,
}

const STEP_TYPE_COLOR: Partial<Record<StepType, string>> = {
  http:      'text-blue-500 bg-blue-50',
  script:    'text-purple-500 bg-purple-50',
  delay:     'text-amber-500 bg-amber-50',
  condition: 'text-emerald-500 bg-emerald-50',
}

function stepDuration(step: StepRun): string {
  if (!step.startedAt) return ''
  const end = step.finishedAt ? dayjs(step.finishedAt) : dayjs()
  const ms = end.diff(dayjs(step.startedAt))
  if (ms < 1000) return `${ms}ms`
  const d = dayjs.duration(ms)
  if (ms < 60_000) return `${d.seconds()}s`
  return `${Math.floor(d.asMinutes())}m ${d.seconds()}s`
}

// ─── JSON output block ────────────────────────────────────────────────────────
function JsonBlock({ value, label }: { value: Record<string, unknown>; label: string }) {
  const [open, setOpen] = useState(false)
  const json = JSON.stringify(value, null, 2)
  const lines = json.split('\n').length

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Terminal className="w-3 h-3" />
        {label}
        <span className="text-gray-300 font-normal ml-1">
          ({lines} {lines === 1 ? 'line' : 'lines'})
        </span>
      </button>
      {open && (
        <pre className="mt-1.5 p-2.5 rounded-lg bg-gray-900 text-gray-100 text-xs font-mono
                        overflow-x-auto max-h-48 leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  )
}

// ─── Step card ────────────────────────────────────────────────────────────────
const CARD_BG: Record<string, string> = {
  running: 'border-indigo-200 bg-indigo-50/60',
  success: 'border-emerald-100 bg-emerald-50/40',
  failed:  'border-red-200 bg-red-50/50',
  skipped: 'border-gray-100 bg-gray-50/50',
  pending: 'border-gray-100 bg-white',
}

function StepCard({ step }: { step: StepRun }) {
  const [expanded, setExpanded] = useState(step.status === 'failed')
  const hasDetails = !!(step.error || (step.output && Object.keys(step.output).length > 0))

  useEffect(() => {
    if (step.status === 'failed') setExpanded(true)
  }, [step.status])

  const dur = stepDuration(step)

  // Try to infer step type from stepId or stepName for the icon
  // (type isn't stored on StepRun, so we guess from the name or fall back to default)
  const typeKey = (step.stepName ?? step.stepId ?? '').toLowerCase()
  const inferredType: StepType | undefined =
    typeKey.includes('http') || typeKey.includes('fetch') || typeKey.includes('api') || typeKey.includes('check') || typeKey.includes('post')
      ? 'http'
      : typeKey.includes('script') || typeKey.includes('process') || typeKey.includes('log') || typeKey.includes('report') || typeKey.includes('build') || typeKey.includes('format') || typeKey.includes('collect')
      ? 'script'
      : typeKey.includes('delay') || typeKey.includes('wait') || typeKey.includes('cool')
      ? 'delay'
      : typeKey.includes('condition') || typeKey.includes('check_status') || typeKey.includes('filter')
      ? 'condition'
      : undefined

  const typeIcon  = inferredType ? STEP_TYPE_ICON[inferredType]  : <Terminal className="w-3 h-3" />
  const typeColor = inferredType ? STEP_TYPE_COLOR[inferredType] : 'text-gray-400 bg-gray-100'

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${CARD_BG[step.status] ?? CARD_BG.pending} ${hasDetails ? 'cursor-pointer' : ''}`}
      onClick={() => hasDetails && setExpanded(o => !o)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 p-3">
        <StepIcon status={step.status} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
              {step.stepName || step.stepId}
            </p>
            {inferredType && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${typeColor}`}>
                {typeIcon}
                {inferredType.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{step.stepId}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {dur && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
              <Clock className="w-2.5 h-2.5" />
              {dur}
            </span>
          )}
          {step.attempt > 1 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">
              <RotateCcw className="w-2.5 h-2.5" />
              ×{step.attempt}
            </span>
          )}
          <Badge status={step.status} />
          {hasDetails && (
            <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasDetails && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-current/10" onClick={e => e.stopPropagation()}>
          {step.error && (
            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-mono break-all leading-relaxed">{step.error}</p>
            </div>
          )}
          {step.output && Object.keys(step.output).length > 0 && (
            <JsonBlock value={step.output} label="Output" />
          )}
          {step.input && Object.keys(step.input).length > 0 && (
            <JsonBlock value={step.input} label="Input" />
          )}
          {step.startedAt && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-gray-400">
                Start: <span className="text-gray-600 font-mono">{dayjs(step.startedAt).format('HH:mm:ss.SSS')}</span>
              </span>
              {step.finishedAt && (
                <span className="text-[10px] text-gray-400">
                  End: <span className="text-gray-600 font-mono">{dayjs(step.finishedAt).format('HH:mm:ss.SSS')}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveMonitor({ run, totalSteps }: LiveMonitorProps) {
  const { stepRuns, setActiveRun } = useWorkflowStore()

  useWebSocket(run.id)

  const { data: apiSteps, isLoading: stepsLoading } = useRunSteps(run.id)

  useEffect(() => {
    setActiveRun(run)
    return () => setActiveRun(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id])

  const isOptimistic = run.id.startsWith('optimistic-')

  // Merge: REST API provides base (historical runs); WS store overrides for live updates.
  // Guard: skip any entry without a valid stepId to prevent phantom steps.
  const mergedSteps: Record<string, StepRun> = {}
  for (const s of (apiSteps ?? [])) {
    if (s.stepId) mergedSteps[s.stepId] = s
  }
  for (const s of Object.values(stepRuns)) {
    if (s.stepId) mergedSteps[s.stepId] = s   // WS wins on conflict
  }

  // Sort: running first (visible at top), then by startedAt ascending (execution order)
  const steps = Object.values(mergedSteps).sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    if (a.startedAt && b.startedAt) return dayjs(a.startedAt).diff(dayjs(b.startedAt))
    return 0
  })

  const runningCount = steps.filter(s => s.status === 'running').length
  const failedCount  = steps.filter(s => s.status === 'failed').length
  const doneCount    = steps.filter(s => s.status === 'success' || s.status === 'skipped').length

  // Use totalSteps from the workflow DAG definition (accurate) if provided;
  // fall back to the observed step count (may be < total while run is in progress)
  const total = totalSteps ?? steps.length

  return (
    <div className="space-y-2">
      {/* Run header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md truncate max-w-[120px]">
          {isOptimistic ? 'queuing…' : `${run.id.slice(0, 12)}…`}
        </span>
        <div className="flex items-center gap-2">
          {!isOptimistic && steps.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {doneCount}/{total} done
              {failedCount > 0 && (
                <span className="text-red-500 ml-1">· {failedCount} failed</span>
              )}
            </span>
          )}
          <Badge status={run.status} />
        </div>
      </div>

      {/* Progress bar */}
      {!isOptimistic && total > 0 && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              failedCount > 0 ? 'bg-red-400' : run.status === 'success' ? 'bg-emerald-400' : 'bg-indigo-400'
            }`}
            style={{ width: `${Math.min((doneCount / total) * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Step list */}
      {isOptimistic ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex gap-1 mb-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
          <p className="text-xs text-gray-400">Queuing trigger…</p>
        </div>
      ) : stepsLoading ? (
        <div className="flex items-center justify-center py-8 gap-2">
          <Spinner size="sm" />
          <p className="text-xs text-gray-400">Loading steps…</p>
        </div>
      ) : !steps.length ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex gap-1 mb-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {runningCount > 0 ? 'Executing…' : 'Waiting for steps…'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {steps.map(step => <StepCard key={step.stepId} step={step} />)}
        </div>
      )}
    </div>
  )
}
