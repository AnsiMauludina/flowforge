import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Play, Pencil, MoreHorizontal, CheckCircle2, XCircle, Loader2,
  ChevronDown, AlertCircle, CalendarClock, Webhook, Circle, ArrowRight,
  Maximize2, X, Copy, ChevronLeft, ChevronRight, Filter, User,
  GitMerge, Check, Sparkles, RotateCcw,
} from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import durationPlugin from 'dayjs/plugin/duration'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import DAGViewer from '@/components/workflow/DAGViewer'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import { useWorkflowStore } from '@/store/workflowStore'
import {
  useWorkflow, useWorkflowRuns, useTriggerWorkflow, useRunSteps,
  useWorkflowVersions, useAnalyzeRun, useRollbackWorkflow,
} from '@/hooks/useWorkflows'
import { useWebSocket } from '@/hooks/useWebSocket'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { WorkflowRun, StepDefinition, StepRun, StepStatus, FailureAnalysis } from '@/types'

dayjs.extend(relativeTime)
dayjs.extend(durationPlugin)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDuration(
  startedAt?: string,
  finishedAt?: string,
  isRunning?: boolean,
): string {
  if (!startedAt) return '—'
  const end = finishedAt
    ? dayjs(finishedAt)
    : isRunning ? dayjs() : null
  if (!end) return '—'
  const ms = end.diff(dayjs(startedAt))
  if (ms < 1000) return `${ms}ms`
  const d = dayjs.duration(ms)
  if (ms < 60_000) return `${d.seconds()}s`
  return `${Math.floor(d.asMinutes())}m ${d.seconds()}s`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

// ─── Step type config ─────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  http:      { label: 'HTTP',      cls: 'bg-blue-50 text-blue-600 border border-blue-100' },
  condition: { label: 'Condition', cls: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
  script:    { label: 'Script',    cls: 'bg-purple-50 text-purple-600 border border-purple-100' },
  delay:     { label: 'Delay',     cls: 'bg-amber-50 text-amber-600 border border-amber-100' },
}

// ─── Step status icon ─────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status?: StepStatus | null }) {
  switch (status) {
    case 'running':  return <Loader2     className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
    case 'success':  return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    case 'failed':   return <AlertCircle  className="w-4 h-4 text-red-500 shrink-0" />
    case 'skipped':  return <XCircle      className="w-4 h-4 text-gray-300 shrink-0" />
    default:         return <Circle       className="w-4 h-4 text-gray-200 shrink-0" />
  }
}

// ─── Workflow Step Card (Overview tab) ────────────────────────────────────────

const STEP_BORDER: Record<string, string> = {
  running: 'border-indigo-100',
  success: 'border-emerald-100',
  failed:  'border-red-100',
  skipped: 'border-gray-100',
}

function WorkflowStepCard({
  step, stepRun, index, showDetails,
}: {
  step: StepDefinition
  stepRun?: StepRun
  index: number
  showDetails: boolean
}) {
  const [localOpen, setLocalOpen] = useState<boolean | null>(null)
  const open = localOpen ?? (showDetails || stepRun?.status === 'failed')

  const dur = stepRun
    ? calcDuration(stepRun.startedAt, stepRun.finishedAt, stepRun.status === 'running')
    : null

  const tc = TYPE_CONFIG[step.type] ?? { label: step.type, cls: 'bg-gray-50 text-gray-500' }

  const details: { label: string; value: string }[] = []
  if (step.type === 'http') {
    if (step.config.method) details.push({ label: 'Method', value: String(step.config.method) })
    if (step.config.url)    details.push({ label: 'URL', value: String(step.config.url) })
    if (stepRun?.output?.status_code != null)
      details.push({ label: 'Status Code', value: String(stepRun.output.status_code) })
    if (dur && dur !== '—')
      details.push({ label: 'Response Time', value: dur })
  } else if (step.type === 'condition') {
    if (step.config.expression)
      details.push({ label: 'Condition', value: String(step.config.expression) })
    if (stepRun?.output?.result != null)
      details.push({ label: 'Result', value: String(stepRun.output.result) })
  } else if (step.type === 'delay') {
    if (step.config.duration) details.push({ label: 'Duration', value: String(step.config.duration) })
  } else if (step.type === 'script') {
    const code = String(step.config.code ?? '')
    if (code) details.push({ label: 'Code', value: code.length > 60 ? code.slice(0, 60) + '…' : code })
  }

  const hasDetails = details.length > 0 || !!stepRun?.error
  const borderCls = stepRun?.status ? (STEP_BORDER[stepRun.status] ?? 'border-gray-100') : 'border-gray-100'

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${borderCls}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setLocalOpen(o => !o)}
      >
        <span className="flex-none w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex items-center justify-center">
          {index}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${tc.cls}`}>
            {tc.label}
          </span>
          <p className="text-sm font-medium text-gray-800 truncate">{step.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dur && dur !== '—' && <span className="text-xs text-gray-400 font-mono">{dur}</span>}
          {stepRun?.status ? <Badge status={stepRun.status} /> : <StepStatusIcon status={null} />}
          {hasDetails && (
            <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {open && hasDetails && (
        <div className="px-4 pb-4 border-t border-gray-50" onClick={e => e.stopPropagation()}>
          {stepRun?.error && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs text-red-700 font-mono break-all leading-relaxed">{stepRun.error}</p>
            </div>
          )}
          {details.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {details.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-xs text-gray-700 break-all">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compact Step Row (Run Detail panel) ─────────────────────────────────────

function CompactStepRow({
  step, stepRun, index,
}: {
  step: StepDefinition
  stepRun?: StepRun
  index: number
}) {
  const dur = stepRun
    ? calcDuration(stepRun.startedAt, stepRun.finishedAt, stepRun.status === 'running')
    : null
  const tc = TYPE_CONFIG[step.type] ?? { label: step.type, cls: 'bg-gray-50 text-gray-500' }

  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
        stepRun?.status === 'success' ? 'bg-emerald-100' :
        stepRun?.status === 'failed'  ? 'bg-red-100' :
        stepRun?.status === 'running' ? 'bg-indigo-100' :
        'bg-gray-100'
      }`}>
        <span className="text-[9px] font-bold text-gray-500">{index}</span>
      </div>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${tc.cls}`}>{tc.label}</span>
      <p className="text-xs text-gray-700 flex-1 truncate">{step.name}</p>
      {dur && dur !== '—' && (
        <span className="text-[10px] text-gray-400 font-mono shrink-0">{dur}</span>
      )}
      {stepRun?.status
        ? <Badge status={stepRun.status} />
        : <span className="text-[10px] text-gray-300">—</span>
      }
    </div>
  )
}

// ─── Step Result Row (Run Detail › Step Results tab) ─────────────────────────

function StepResultRow({ stepRun }: { stepRun: StepRun }) {
  const [open, setOpen] = useState(stepRun.status === 'failed')
  const dur = calcDuration(stepRun.startedAt, stepRun.finishedAt, stepRun.status === 'running')
  const hasOutput = stepRun.output && Object.keys(stepRun.output).length > 0

  return (
    <div className={`rounded-lg border ${
      stepRun.status === 'failed'  ? 'border-red-100 bg-red-50/30' :
      stepRun.status === 'success' ? 'border-emerald-50' :
      'border-gray-100'
    }`}>
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
        onClick={() => (stepRun.error || hasOutput) && setOpen(o => !o)}
      >
        <StepStatusIcon status={stepRun.status as StepStatus} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{stepRun.stepName || stepRun.stepId}</p>
          <p className="text-[10px] text-gray-400 font-mono">{stepRun.stepId}</p>
        </div>
        <span className="text-[10px] text-gray-400 font-mono shrink-0">{dur}</span>
        <Badge status={stepRun.status as StepStatus} />
        {(stepRun.error || hasOutput) && (
          <ChevronDown className={`w-3 h-3 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {open && (stepRun.error || hasOutput) && (
        <div className="px-3 pb-3 border-t border-current/5 space-y-2">
          {stepRun.error && (
            <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs text-red-700 font-mono break-all leading-relaxed">{stepRun.error}</p>
            </div>
          )}
          {hasOutput && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Output</p>
              <pre className="p-2.5 rounded-lg bg-gray-900 text-gray-100 text-[10px] font-mono overflow-x-auto max-h-32 leading-relaxed">
                {JSON.stringify(stepRun.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AI Failure Analysis Panel ───────────────────────────────────────────────

function AIAnalysisPanel({ runId }: { runId: string }) {
  const analyzeMutation = useAnalyzeRun()
  const [result, setResult] = useState<FailureAnalysis | null>(null)
  const [open, setOpen] = useState(false)

  const isOptimistic = runId.startsWith('optimistic-')
  if (isOptimistic) return null

  const handleAnalyze = async () => {
    setOpen(true)
    try {
      const data = await analyzeMutation.mutateAsync(runId)
      setResult(data)
    } catch { /* shown via mutation state */ }
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={handleAnalyze}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700
                     bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-2 rounded-xl
                     transition-colors w-full justify-center"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Analyze failure with AI
        </button>
      ) : (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-violet-100/60 border-b border-violet-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
              <Sparkles className="w-3.5 h-3.5" />
              AI Diagnosis
            </div>
            <button
              onClick={() => { setOpen(false); setResult(null) }}
              className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="p-3 space-y-3">
            {analyzeMutation.isPending && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" />
                <p className="text-xs text-violet-500">Analyzing failure…</p>
              </div>
            )}
            {analyzeMutation.isError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {analyzeMutation.error instanceof Error
                  ? analyzeMutation.error.message
                  : 'Analysis failed'}
              </p>
            )}
            {result && (
              <>
                <div>
                  <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-1">Diagnosis</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{result.diagnosis}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-1">Suggested Fix</p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{result.suggestedFix}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Runs Monitor Panel (Overview right col) ──────────────────────────────────

function RunsMonitorPanel({
  runs, total, selectedRunId, onSelectRun, onClear, onViewAll,
}: {
  runs: WorkflowRun[]
  total: number
  selectedRunId?: string
  onSelectRun: (run: WorkflowRun) => void
  onClear: () => void
  onViewAll: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const successCount = runs.filter(r => r.status === 'success').length
  const runningCount = runs.filter(r => r.status === 'running').length
  const failedCount  = runs.filter(r => r.status === 'failed' || r.status === 'timeout').length

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Live Monitor</h3>
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              failed
            </span>
          )}
        </div>
        {selectedRunId && (
          <button onClick={onClear} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors">
            Clear
          </button>
        )}
      </div>

      <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-50 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-500">Total Runs: <span className="font-semibold text-gray-700">{total}</span></span>
        <span className="text-gray-200">|</span>
        <span className="text-emerald-600 font-medium">{successCount} Success</span>
        <span className="text-gray-200">|</span>
        <span className="text-indigo-600 font-medium">{runningCount} Running</span>
        <span className="text-gray-200">|</span>
        <span className="text-red-600 font-medium">{failedCount} Failed</span>
      </div>

      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-gray-400">No runs yet</p>
          </div>
        ) : runs.map(run => (
          <div key={run.id}>
            <div
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50/70 transition-colors ${selectedRunId === run.id ? 'bg-indigo-50/40' : ''}`}
              onClick={() => {
                onSelectRun(run)
                if (run.status === 'failed' || run.status === 'timeout') {
                  setExpandedId(prev => prev === run.id ? null : run.id)
                }
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge status={run.status} />
                <span className="text-xs text-gray-500 shrink-0">
                  {dayjs(run.createdAt).format('MMM D, YYYY h:mm A')}
                </span>
              </div>
              <span className="text-xs text-gray-400 font-mono ml-2 shrink-0">
                {calcDuration(run.startedAt, run.finishedAt, run.status === 'running')}
              </span>
            </div>
            {expandedId === run.id && (
              <div className="mx-4 mb-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                <p className="text-[10px] font-semibold text-red-500 mb-1 uppercase tracking-wide">Error</p>
                <p className="text-xs text-red-700 font-mono">Run failed — click step details for more info</p>
                <p className="text-[10px] text-gray-400 font-mono mt-1">Run ID: {run.id.slice(0, 12)}…</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-50">
        <button
          onClick={onViewAll}
          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors flex items-center gap-1"
        >
          View all runs <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Version Card ─────────────────────────────────────────────────────────────

function VersionCard({
  versionNumber,
  createdAt,
  isCurrent,
  onRollback,
  rollbackPending,
  compact = false,
}: {
  versionNumber: number
  createdAt: string
  isCurrent: boolean
  onRollback?: () => void
  rollbackPending?: boolean
  compact?: boolean
}) {
  return (
    <div className={`${compact ? 'px-4 py-3' : 'flex items-start gap-3 p-4 rounded-xl border'} ${
      isCurrent
        ? compact ? '' : 'bg-indigo-50/60 border-indigo-100'
        : compact ? '' : 'border-gray-100 hover:border-gray-200 transition-colors'
    }`}>
      {!compact && (
        <div className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
          isCurrent ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
        }`}>
          v{versionNumber}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-xs font-semibold ${isCurrent ? 'text-gray-800' : 'text-gray-600'}`}>
              v{versionNumber}
            </span>
            {isCurrent && (
              <>
                <span className="text-[10px] text-gray-400">(Current)</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  Active
                </span>
              </>
            )}
          </div>
          {!isCurrent && onRollback && (
            <button
              onClick={onRollback}
              disabled={rollbackPending}
              className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800
                         bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg
                         transition-colors disabled:opacity-50 shrink-0"
            >
              {rollbackPending
                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                : <RotateCcw className="w-2.5 h-2.5" />
              }
              Rollback
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {dayjs(createdAt).format('MMM D, YYYY h:mm A')}
          <span className="mx-1 text-gray-200">·</span>
          {dayjs(createdAt).fromNow()}
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'runs',      label: 'Runs' },
  { key: 'settings',  label: 'Settings' },
  { key: 'versions',  label: 'Versions' },
] as const

type Tab = typeof TABS[number]['key']

const PER_PAGE_OPTIONS = [10, 20, 50] as const

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab]         = useState<Tab>('overview')
  const [selectedRun, setSelectedRun]     = useState<WorkflowRun | null>(null)
  const [runsPage, setRunsPage]           = useState(1)
  const [runsPerPage, setRunsPerPage]     = useState<10 | 20 | 50>(10)
  const [showStepDetails, setShowStepDetails] = useState(true)

  // Runs tab state
  const [runsStatusFilter, setRunsStatusFilter] = useState('')
  const [runDetailTab, setRunDetailTab]   = useState<'summary' | 'step-results'>('summary')

  // Wrapper handlers that co-locate related state resets (avoids setState-in-effect)
  const handleSelectRun = useCallback((run: WorkflowRun | null) => {
    setSelectedRun(run)
    setRunDetailTab('summary')
  }, [])

  const handleSetFilter = useCallback((filter: string) => {
    setRunsStatusFilter(filter)
    setRunsPage(1)
  }, [])

  const handleSetPerPage = useCallback((perPage: 10 | 20 | 50) => {
    setRunsPerPage(perPage)
    setRunsPage(1)
  }, [])
  const [copiedRunId, setCopiedRunId]     = useState(false)

  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)

  const { data: workflow, isLoading } = useWorkflow(id!)
  const { data: runsData }            = useWorkflowRuns(id!, runsPage, runsPerPage)
  const { data: versions }            = useWorkflowVersions(id!)
  const triggerMutation               = useTriggerWorkflow()
  const rollbackMutation              = useRollbackWorkflow(id!)
  const { stepRuns: wsStepRuns, setActiveRun } = useWorkflowStore()

  useWebSocket(selectedRun?.id)
  const { data: apiSteps } = useRunSteps(selectedRun?.id)

  // Merge REST + WebSocket step runs
  const mergedStepRuns: Record<string, StepRun> = {}
  for (const s of (apiSteps ?? [])) {
    if (s.stepId) mergedStepRuns[s.stepId] = s
  }
  for (const s of Object.values(wsStepRuns)) {
    if (s.stepId) mergedStepRuns[s.stepId] = s
  }

  useEffect(() => {
    setActiveRun(selectedRun)
    return () => setActiveRun(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun?.id])

  const handleTrigger = async () => {
    try {
      const result = await triggerMutation.mutateAsync(id!)
      if (result?.runId) {
        setSelectedRun({
          id: result.runId,
          workflowId: id!,
          tenantId: '',
          status: 'running',
          triggerType: 'manual',
          createdAt: new Date().toISOString(),
        })
      }
    } catch { /* handled by mutation state */ }
  }

  const handleCopyRunId = (runId: string) => {
    copyToClipboard(runId)
    setCopiedRunId(true)
    setTimeout(() => setCopiedRunId(false), 2000)
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Layout title="Workflow">
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      </Layout>
    )
  }
  if (!workflow) {
    return (
      <Layout title="Workflow">
        <div className="text-center py-24 text-gray-400 text-sm">Workflow not found</div>
      </Layout>
    )
  }

  const totalSteps = workflow.dag?.steps?.length ?? 0
  const runs       = runsData?.data ?? []
  const totalRuns  = runsData?.total ?? 0

  // Client-side status filter (within current page)
  const filteredRuns = runsStatusFilter
    ? runs.filter(r => r.status === runsStatusFilter)
    : runs

  const successCount = runs.filter(r => r.status === 'success').length
  const runningCount = runs.filter(r => r.status === 'running').length
  const failedCount  = runs.filter(r => r.status === 'failed' || r.status === 'timeout').length

  // Find first failed step for error display in Run Detail
  const failedStep = selectedRun
    ? Object.values(mergedStepRuns).find(s => s.status === 'failed')
    : undefined

  // Total pages
  const totalPages = Math.max(1, Math.ceil(totalRuns / runsPerPage))

  return (
    <Layout title={workflow.name}>
      <div className="space-y-0">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/workflows')}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Workflows
            </button>
            <span className="text-gray-200 text-xs">/</span>
            <span className="text-xs font-semibold text-gray-800">{workflow.name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1 ${
              workflow.isActive
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              {workflow.isActive ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => navigate(`/workflows/${id}/edit`)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              title="Edit workflow"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleTrigger} loading={triggerMutation.isPending} size="sm">
              <Play className="w-3.5 h-3.5" />
              Trigger Run
            </Button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all border border-gray-100">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center border-b border-gray-100 mb-5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-12 gap-4 items-start">

            {/* LEFT: DAG Viewer + Workflow Info */}
            <div className="col-span-5 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Workflow Graph</h3>
                  <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />
                    View Fullscreen
                  </button>
                </div>
                <div style={{ height: 340 }}>
                  <DAGViewer dag={workflow.dag} stepRuns={mergedStepRuns} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Workflow Info</h3>
                {workflow.description && (
                  <div className="mb-3 pb-3 border-b border-gray-50">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{workflow.description}</p>
                  </div>
                )}
                <div className="space-y-2.5">
                  {([
                    { label: 'Steps',        value: String(totalSteps) },
                    { label: 'Version',      value: `v${workflow.version}` },
                    { label: 'Timeout',      value: workflow.dag?.timeout ? `${workflow.dag.timeout}s` : 'Default (5 min)' },
                    { label: 'Created',      value: dayjs(workflow.createdAt).format('M/D/YYYY h:mm A') },
                    { label: 'Last Updated', value: dayjs(workflow.updatedAt).format('M/D/YYYY h:mm A') },
                  ] as const).map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-xs font-medium text-gray-700">{value}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">Creator</p>
                    <div className="flex items-center gap-1">
                      {workflow.cronExpression
                        ? <><CalendarClock className="w-3.5 h-3.5 text-cyan-500" /><span className="text-xs font-medium text-gray-700">Scheduled</span></>
                        : <><Webhook className="w-3.5 h-3.5 text-pink-500" /><span className="text-xs font-medium text-gray-700">Manual / Webhook</span></>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MIDDLE: Workflow Steps */}
            <div className="col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Workflow Steps</h3>
                <button
                  onClick={() => setShowStepDetails(v => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  {showStepDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {workflow.dag?.steps?.length ? (
                  workflow.dag.steps.map((step, idx) => (
                    <WorkflowStepCard
                      key={step.id}
                      step={step}
                      stepRun={mergedStepRuns[step.id]}
                      index={idx + 1}
                      showDetails={showStepDetails}
                    />
                  ))
                ) : (
                  <p className="text-xs text-gray-400 text-center py-8">No steps defined</p>
                )}
              </div>
            </div>

            {/* RIGHT: Live Monitor + Run History */}
            <div className="col-span-3 space-y-4">
              <RunsMonitorPanel
                runs={runs}
                total={totalRuns}
                selectedRunId={selectedRun?.id}
                onSelectRun={handleSelectRun}
                onClear={() => handleSelectRun(null)}
                onViewAll={() => setActiveTab('runs')}
              />

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Run History</h3>
                  <button
                    onClick={() => setActiveTab('runs')}
                    className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                  >
                    View all
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {runs.slice(0, 5).map(run => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      onClick={() => handleSelectRun(run)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge status={run.status} />
                        <span className="text-xs text-gray-500 truncate">
                          {dayjs(run.createdAt).format('MMM D h:mm A')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono shrink-0 ml-1">
                        {calcDuration(run.startedAt, run.finishedAt, run.status === 'running')}
                      </span>
                    </div>
                  ))}
                  {runs.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-gray-400">No runs yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Runs Tab ── */}
        {activeTab === 'runs' && (
          <div className="grid grid-cols-12 gap-4 items-start">

            {/* LEFT: Runs History */}
            <div className={selectedRun ? 'col-span-5' : 'col-span-8'}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Header */}
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Runs History</h3>

                  {/* Stats badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">
                      Total: <span className="font-semibold text-gray-700">{totalRuns}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Success: {successCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      Running: {runningCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Failed: {failedCount}
                    </span>
                  </div>

                  {/* Filter row */}
                  <div className="flex items-center gap-2 mt-3">
                    <select
                      value={runsStatusFilter}
                      onChange={e => handleSetFilter(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer"
                    >
                      <option value="">Status</option>
                      <option value="success">Success</option>
                      <option value="running">Running</option>
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                      <option value="timeout">Timeout</option>
                    </select>
                    <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 bg-white flex-1">
                      <span>{dayjs().format('M/D/YYYY')}</span>
                      <span className="text-gray-300">–</span>
                      <span>{dayjs().format('M/D/YYYY')}</span>
                    </div>
                    <button className="flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                      <Filter className="w-3 h-3" />
                      Filter
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50 bg-gray-50/50">
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Start Time</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Duration</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Trigger</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Version</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Run ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRuns.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center">
                            <p className="text-sm text-gray-400">No runs found</p>
                          </td>
                        </tr>
                      ) : filteredRuns.map(run => (
                        <tr
                          key={run.id}
                          onClick={() => handleSelectRun(run)}
                          className={`cursor-pointer hover:bg-gray-50/70 transition-colors ${
                            selectedRun?.id === run.id ? 'bg-indigo-50/40 border-l-2 border-l-indigo-400' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <Badge status={run.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {run.startedAt
                              ? dayjs(run.startedAt).format('MMM D, YYYY h:mm A')
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                            {calcDuration(run.startedAt, run.finishedAt, run.status === 'running')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {run.triggerType === 'scheduled'
                                ? <CalendarClock className="w-3 h-3 text-cyan-500" />
                                : <User className="w-3 h-3 text-gray-400" />
                              }
                              <span className="text-xs text-gray-600 capitalize">{run.triggerType}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            v{workflow.version}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                            {run.id.slice(0, 8)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
                  <p className="text-xs text-gray-400">
                    {totalRuns === 0
                      ? '0 runs'
                      : `${Math.min((runsPage - 1) * runsPerPage + 1, totalRuns)}–${Math.min(runsPage * runsPerPage, totalRuns)} of ${totalRuns} runs`
                    }
                  </p>

                  <div className="flex items-center gap-1">
                    <button
                      disabled={runsPage === 1}
                      onClick={() => setRunsPage(p => p - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => setRunsPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          runsPage === p
                            ? 'bg-indigo-600 text-white'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      disabled={runsPage >= totalPages}
                      onClick={() => setRunsPage(p => p + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <select
                    value={runsPerPage}
                    onChange={e => handleSetPerPage(Number(e.target.value) as 10 | 20 | 50)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer"
                  >
                    {PER_PAGE_OPTIONS.map(n => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* MIDDLE: Run Detail */}
            {selectedRun && (
              <div className="col-span-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Panel header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Run Detail</h3>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{selectedRun.id.slice(0, 8)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={selectedRun.status} />
                      <button
                        onClick={() => handleSelectRun(null)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Run meta grid */}
                  <div className="px-4 py-3 border-b border-gray-50 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Start Time</p>
                      <p className="text-xs font-medium text-gray-700">
                        {selectedRun.startedAt
                          ? dayjs(selectedRun.startedAt).format('MMM D, YYYY h:mm A')
                          : '—'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Duration</p>
                      <p className="text-xs font-medium text-gray-700">
                        {calcDuration(selectedRun.startedAt, selectedRun.finishedAt, selectedRun.status === 'running')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Version</p>
                      <p className="text-xs font-medium text-gray-700">v{workflow.version}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Trigger</p>
                      <p className="text-xs font-medium text-gray-700 capitalize">{selectedRun.triggerType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Timeout</p>
                      <p className="text-xs font-medium text-gray-700">
                        {workflow.dag?.timeout ? `${workflow.dag.timeout}s` : '5 min'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Run ID</p>
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-mono text-gray-600">{selectedRun.id.slice(0, 8)}</p>
                        <button
                          onClick={() => handleCopyRunId(selectedRun.id)}
                          className="text-gray-300 hover:text-gray-500 transition-colors"
                          title="Copy full Run ID"
                        >
                          {copiedRunId
                            ? <Check className="w-3 h-3 text-emerald-500" />
                            : <Copy className="w-3 h-3" />
                          }
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex border-b border-gray-100">
                    {(['summary', 'step-results'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRunDetailTab(tab)}
                        className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px capitalize ${
                          runDetailTab === tab
                            ? 'text-indigo-600 border-indigo-500'
                            : 'text-gray-400 border-transparent hover:text-gray-600'
                        }`}
                      >
                        {tab === 'step-results' ? 'Step Results' : 'Summary'}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="p-4 space-y-4 max-h-[480px] overflow-y-auto">

                    {/* Summary tab */}
                    {runDetailTab === 'summary' && (
                      <>
                        {/* Error block + AI analysis */}
                        {(selectedRun.status === 'failed' || selectedRun.status === 'timeout') && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700">Error</p>
                            {failedStep?.error && (
                              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                <p className="text-xs text-red-700 font-mono break-all leading-relaxed">
                                  {failedStep.error}
                                </p>
                              </div>
                            )}
                            <AIAnalysisPanel runId={selectedRun.id} />
                          </div>
                        )}

                        {/* Workflow Steps */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Workflow Steps</p>
                          <div className="space-y-1 divide-y divide-gray-50">
                            {workflow.dag?.steps?.map((step, idx) => (
                              <CompactStepRow
                                key={step.id}
                                step={step}
                                stepRun={mergedStepRuns[step.id]}
                                index={idx + 1}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Step Results tab */}
                    {runDetailTab === 'step-results' && (
                      <div className="space-y-2">
                        {Object.values(mergedStepRuns).length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-xs text-gray-400">No step results yet</p>
                          </div>
                        ) : Object.values(mergedStepRuns)
                            .sort((a, b) => {
                              if (a.startedAt && b.startedAt) return dayjs(a.startedAt).diff(dayjs(b.startedAt))
                              return 0
                            })
                            .map(sr => (
                              <StepResultRow key={sr.stepId} stepRun={sr} />
                            ))
                        }
                      </div>
                    )}
                  </div>

                  {/* Footer: View Full Logs */}
                  <div className="px-4 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setRunDetailTab('step-results')}
                      className="w-full py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors"
                    >
                      View Full Logs
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT: Workflow Settings + Versions */}
            <div className={selectedRun ? 'col-span-3' : 'col-span-4'}>

              {/* Workflow Settings */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Workflow Settings</h3>
                  <button
                    onClick={() => navigate(`/workflows/${id}/edit`)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { label: 'Workflow Name', value: workflow.name, isText: true },
                    { label: 'Description',   value: workflow.description || '—', isText: true },
                    { label: 'Timeout',       value: workflow.dag?.timeout ? `${workflow.dag.timeout}s` : '5 minutes', isText: true },
                    { label: 'Concurrency',   value: '1 run at a time', isText: true },
                    { label: 'On Failure',    value: 'Stop workflow', isText: true },
                    { label: 'Retry',         value: '0 times', isText: true },
                    { label: 'Created',       value: dayjs(workflow.createdAt).format('MMM D, YYYY h:mm A'), isText: true },
                    { label: 'Last Updated',  value: dayjs(workflow.updatedAt).format('MMM D, YYYY h:mm A'), isText: true },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-400 shrink-0">{label}</p>
                      {label === 'Workflow Name' ? (
                        <p className="text-xs font-medium text-gray-800 text-right">{value}</p>
                      ) : (
                        <p className="text-xs text-gray-600 text-right leading-relaxed">{value}</p>
                      )}
                    </div>
                  ))}
                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">Status</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      workflow.isActive
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      {workflow.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Versions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Versions</h3>
                  <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
                    <GitMerge className="w-3 h-3" />
                    Compare
                  </button>
                </div>

                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                  {/* Current version */}
                  <VersionCard
                    compact
                    versionNumber={workflow.version}
                    createdAt={workflow.updatedAt}
                    isCurrent={true}
                  />
                  {/* Previous versions */}
                  {(versions ?? [])
                    .filter(v => v.version !== workflow.version)
                    .sort((a, b) => b.version - a.version)
                    .map(v => (
                      <VersionCard
                        key={v.id}
                        compact
                        versionNumber={v.version}
                        createdAt={v.createdAt}
                        isCurrent={false}
                        onRollback={() => setRollbackTarget(v.version)}
                        rollbackPending={rollbackMutation.isPending && rollbackTarget === v.version}
                      />
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Workflow Settings</h3>
            <div className="space-y-3">
              {([
                { label: 'Name',        value: workflow.name },
                { label: 'Description', value: workflow.description || '—' },
                { label: 'Schedule',    value: workflow.cronExpression || 'Manual / Webhook' },
                { label: 'Status',      value: workflow.isActive ? 'Active' : 'Inactive' },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4 py-2 border-b border-gray-50 last:border-0">
                  <p className="text-xs text-gray-400 w-24 shrink-0 mt-0.5">{label}</p>
                  <p className="text-xs font-medium text-gray-700">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Versions Tab ── */}
        {activeTab === 'versions' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Version History</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(versions?.length ?? 0) + 1} version{(versions?.length ?? 0) > 0 ? 's' : ''} total
                </p>
              </div>
              <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
                <GitMerge className="w-3 h-3" />
                Compare
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              {/* Current version */}
              <VersionCard
                versionNumber={workflow.version}
                createdAt={workflow.updatedAt}
                isCurrent={true}
              />

              {/* Previous versions — sorted newest first */}
              {(versions ?? [])
                .filter(v => v.version !== workflow.version)
                .sort((a, b) => b.version - a.version)
                .map(v => (
                  <VersionCard
                    key={v.id}
                    versionNumber={v.version}
                    createdAt={v.createdAt}
                    isCurrent={false}
                    onRollback={() => setRollbackTarget(v.version)}
                    rollbackPending={rollbackMutation.isPending && rollbackTarget === v.version}
                  />
                ))
              }

              {!versions?.length && (
                <p className="text-xs text-gray-400 text-center py-4">No previous versions</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Rollback Confirmation Dialog */}
      <ConfirmDialog
        open={rollbackTarget !== null}
        title={`Rollback to v${rollbackTarget}?`}
        description={`The workflow will be restored to version ${rollbackTarget}. A new version will be created preserving the current state. This action cannot be undone automatically.`}
        confirmLabel="Rollback"
        loading={rollbackMutation.isPending}
        onConfirm={() => {
          if (rollbackTarget === null) return
          rollbackMutation.mutate(rollbackTarget, {
            onSuccess: () => setRollbackTarget(null),
          })
        }}
        onCancel={() => setRollbackTarget(null)}
      />
    </Layout>
  )
}
