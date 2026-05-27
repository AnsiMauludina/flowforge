import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, Globe, Terminal,
  Timer, GitBranch, Play, CalendarClock, Webhook, Sparkles,
  ChevronDown, X, CheckCircle2, Loader2,
} from 'lucide-react'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import { useCreateWorkflow, useScheduleSuggestions } from '@/hooks/useWorkflows'
import { generateWorkflowWithAI } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = 'http' | 'script' | 'delay' | 'condition'
type TriggerType = 'manual' | 'cron' | 'webhook'
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

interface HeaderPair { key: string; value: string }

interface StepForm {
  name: string
  type: StepType
  dependencies: string[]
  httpUrl: string
  httpMethod: HttpMethod
  httpHeaders: HeaderPair[]
  httpBody: string
  scriptCode: string
  delayDuration: string
  conditionExpr: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_TYPE_META: Record<StepType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  http:      { label: 'HTTP Request', icon: <Globe className="w-4 h-4" />,      color: 'text-blue-600',   bg: 'bg-blue-100'   },
  script:    { label: 'Run Script',   icon: <Terminal className="w-4 h-4" />,   color: 'text-purple-600', bg: 'bg-purple-100' },
  delay:     { label: 'Wait / Delay', icon: <Timer className="w-4 h-4" />,      color: 'text-amber-600',  bg: 'bg-amber-100'  },
  condition: { label: 'Condition',    icon: <GitBranch className="w-4 h-4" />,  color: 'text-emerald-600',bg: 'bg-emerald-100'},
}

const TRIGGER_META: Record<TriggerType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  manual:  { label: 'Manual',          icon: <Play className="w-4 h-4" />,        color: 'text-orange-600', bg: 'bg-orange-100' },
  cron:    { label: 'Scheduled',       icon: <CalendarClock className="w-4 h-4" />,color: 'text-cyan-600',  bg: 'bg-cyan-100'   },
  webhook: { label: 'Webhook Trigger', icon: <Webhook className="w-4 h-4" />,    color: 'text-pink-600',   bg: 'bg-pink-100'   },
}

const DEFAULT_STEP: StepForm = {
  name: 'New Step',
  type: 'http',
  dependencies: [],
  httpUrl: 'https://api.example.com/endpoint',
  httpMethod: 'GET',
  httpHeaders: [],
  httpBody: '',
  scriptCode: 'echo "Processing..."',
  delayDuration: '5s',
  conditionExpr: '${status} == 200',
}

function makeId(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40)
}

// Convert structured StepForm → DAG step config
function stepToDAGConfig(step: StepForm): Record<string, unknown> {
  switch (step.type) {
    case 'http': {
      const config: Record<string, unknown> = { url: step.httpUrl, method: step.httpMethod }
      const headers = step.httpHeaders.filter(h => h.key.trim())
      if (headers.length) config.headers = Object.fromEntries(headers.map(h => [h.key, h.value]))
      if (step.httpBody && step.httpMethod !== 'GET') {
        try { config.body = JSON.parse(step.httpBody) } catch { config.body = step.httpBody }
      }
      return config
    }
    case 'script':    return { code: step.scriptCode }
    case 'delay':     return { duration: step.delayDuration }
    case 'condition': return { expression: step.conditionExpr }
  }
}

// Convert AI-returned DAG step → StepForm
function dagStepToForm(step: Record<string, unknown>): StepForm {
  const cfg = (step.config as Record<string, unknown>) ?? {}
  const base: StepForm = { ...DEFAULT_STEP, name: String(step.name ?? 'Step'), type: (step.type as StepType) ?? 'http', dependencies: (step.dependencies as string[]) ?? [] }
  switch (step.type) {
    case 'http':
      base.httpUrl    = String(cfg.url ?? '')
      base.httpMethod = (cfg.method as HttpMethod) ?? 'GET'
      if (cfg.headers && typeof cfg.headers === 'object') {
        base.httpHeaders = Object.entries(cfg.headers as Record<string, string>).map(([key, value]) => ({ key, value: String(value) }))
      }
      if (cfg.body) base.httpBody = JSON.stringify(cfg.body, null, 2)
      break
    case 'script':    base.scriptCode    = String(cfg.code ?? '') ; break
    case 'delay':     base.delayDuration = String(cfg.duration ?? '5s') ; break
    case 'condition': base.conditionExpr = String(cfg.expression ?? '') ; break
  }
  return base
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepNodeCard({
  step, idx, stepId, isSelected, hasError, onSelect, onDelete, canDelete,
}: {
  step: StepForm; idx: number; stepId: string
  isSelected: boolean; hasError: boolean
  onSelect: () => void; onDelete: () => void; canDelete: boolean
}) {
  const meta = STEP_TYPE_META[step.type]
  return (
    <div
      onClick={onSelect}
      className={`relative cursor-pointer rounded-2xl border-2 p-4 transition-all duration-150 ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50/60 shadow-md shadow-indigo-100'
          : hasError
          ? 'border-red-200 bg-red-50/30 hover:border-red-300'
          : 'border-gray-100 bg-white hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg} ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">{idx + 1}.</span>
            <span className="text-sm font-semibold text-gray-800 truncate">{step.name || 'Unnamed Step'}</span>
          </div>
          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {hasError && <AlertCircle className="w-4 h-4 text-red-400" />}
          {!hasError && isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="ml-1 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Brief summary line */}
      <div className="mt-2 ml-12 text-xs text-gray-400 truncate">
        {step.type === 'http' && (step.httpUrl || '—')}
        {step.type === 'script' && (step.scriptCode.split('\n')[0] || '—')}
        {step.type === 'delay' && `Wait ${step.delayDuration}`}
        {step.type === 'condition' && (step.conditionExpr || '—')}
      </div>

      {/* Step ID chip */}
      <div className="mt-1.5 ml-12">
        <code className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${stepId ? 'bg-indigo-50 text-indigo-500' : 'bg-red-50 text-red-400'}`}>
          {stepId || '(empty id)'}
        </code>
      </div>
    </div>
  )
}

function TriggerCard({
  triggerType, isSelected, onSelect, wfName,
}: {
  triggerType: TriggerType; isSelected: boolean; onSelect: () => void; wfName: string
}) {
  const meta = TRIGGER_META[triggerType]
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-2xl border-2 p-4 transition-all duration-150 ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50/60 shadow-md shadow-indigo-100'
          : 'border-dashed border-gray-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg} ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Trigger</span>
          </div>
          <span className={`text-sm font-semibold ${wfName ? 'text-gray-800' : 'text-gray-400'}`}>
            {wfName || 'Click to configure…'}
          </span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>{meta.label}</span>
      </div>
    </div>
  )
}

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center my-0.5">
      <div className="w-px h-4 bg-gray-200" />
      <button
        type="button"
        onClick={onClick}
        className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-200" />
    </div>
  )
}

// ─── Config Panels ─────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

function TriggerPanel({
  wfName, setWfName, description, setDescription,
  triggerType, setTriggerType, cronExpression, setCronExpression,
  timeoutSec, setTimeoutSec,
  workflowId,
}: {
  wfName: string; setWfName: (v: string) => void
  description: string; setDescription: (v: string) => void
  triggerType: TriggerType; setTriggerType: (v: TriggerType) => void
  cronExpression: string; setCronExpression: (v: string) => void
  timeoutSec: string; setTimeoutSec: (v: string) => void
  workflowId?: string
}) {
  const scheduleMutation = useScheduleSuggestions()
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleSuggest = async () => {
    setShowSuggestions(true)
    await scheduleMutation.mutateAsync({ workflowId, description: description || wfName })
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Trigger Configuration</h3>
        <p className="text-xs text-gray-400 mt-0.5">Set when and how this workflow starts.</p>
      </div>

      <div>
        <label className={labelCls}>Workflow Name *</label>
        <input value={wfName} onChange={e => setWfName(e.target.value)} className={inputCls} placeholder="My Automation Workflow" required minLength={3} />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="What does this workflow do?" />
      </div>

      <div>
        <label className={labelCls}>Trigger Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TRIGGER_META) as TriggerType[]).map(t => {
            const meta = TRIGGER_META[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTriggerType(t)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                  triggerType === t
                    ? `border-indigo-400 ${meta.bg} ${meta.color}`
                    : 'border-gray-100 text-gray-500 hover:border-gray-200'
                }`}
              >
                {meta.icon}
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {triggerType === 'cron' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls} style={{ marginBottom: 0 }}>Cron Expression</label>
            <button
              type="button"
              onClick={handleSuggest}
              disabled={scheduleMutation.isPending}
              className="flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700
                         bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
            >
              {scheduleMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />
              }
              AI Suggest
            </button>
          </div>
          <input
            value={cronExpression}
            onChange={e => setCronExpression(e.target.value)}
            className={inputCls}
            placeholder="0 9 * * 1-5  (weekdays at 9am)"
          />
          <p className="mt-1 text-xs text-gray-400">Standard 5-field cron: minute hour day month weekday</p>

          {/* AI suggestions panel */}
          {showSuggestions && (
            <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-violet-100/60 border-b border-violet-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                  <Sparkles className="w-3 h-3" />
                  AI Schedule Suggestions
                </div>
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors"
                >
                  Close
                </button>
              </div>

              {scheduleMutation.isPending && (
                <div className="flex items-center gap-2 px-3 py-4">
                  <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" />
                  <p className="text-xs text-violet-500">Generating suggestions…</p>
                </div>
              )}

              {scheduleMutation.isError && (
                <p className="text-xs text-red-600 px-3 py-3">
                  {scheduleMutation.error instanceof Error
                    ? scheduleMutation.error.message
                    : 'Failed to get suggestions'}
                </p>
              )}

              {scheduleMutation.data && scheduleMutation.data.length > 0 && (
                <div className="divide-y divide-violet-100">
                  {scheduleMutation.data.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setCronExpression(s.cron); setShowSuggestions(false) }}
                      className="w-full text-left px-3 py-2.5 hover:bg-violet-100/60 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 group-hover:text-violet-700 transition-colors">
                            {s.label}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{s.reason}</p>
                        </div>
                        <code className="text-[10px] font-mono bg-white border border-violet-200 text-violet-700
                                         px-2 py-0.5 rounded-md shrink-0">
                          {s.cron}
                        </code>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {triggerType === 'webhook' && (
        <div className="p-3.5 bg-pink-50 border border-pink-100 rounded-xl text-xs text-pink-700">
          A webhook URL will be generated after saving the workflow. Use it to trigger runs from external systems.
        </div>
      )}

      <div>
        <label className={labelCls}>Global Timeout (seconds)</label>
        <input type="number" value={timeoutSec} onChange={e => setTimeoutSec(e.target.value)} className={inputCls} placeholder="300 (optional)" min={1} />
      </div>
    </div>
  )
}

function HttpConfigPanel({ step, onChange }: { step: StepForm; onChange: (patch: Partial<StepForm>) => void }) {
  const addHeader = () => onChange({ httpHeaders: [...step.httpHeaders, { key: '', value: '' }] })
  const removeHeader = (i: number) => onChange({ httpHeaders: step.httpHeaders.filter((_, idx) => idx !== i) })
  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...step.httpHeaders]
    next[i] = { ...next[i], [field]: val }
    onChange({ httpHeaders: next })
  }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>URL *</label>
        <input value={step.httpUrl} onChange={e => onChange({ httpUrl: e.target.value })} className={inputCls} placeholder="https://api.example.com/endpoint" />
      </div>
      <div>
        <label className={labelCls}>Method</label>
        <div className="relative">
          <select value={step.httpMethod} onChange={e => onChange({ httpMethod: e.target.value as HttpMethod })} className={`${inputCls} appearance-none pr-8`}>
            {(['GET','POST','PUT','DELETE','PATCH'] as HttpMethod[]).map(m => <option key={m}>{m}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelCls + ' mb-0'}>Headers</label>
          <button type="button" onClick={addHeader} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add header
          </button>
        </div>
        <div className="space-y-2">
          {step.httpHeaders.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input value={h.key}   onChange={e => updateHeader(i, 'key', e.target.value)}   className={inputCls} placeholder="Content-Type" />
              <input value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)} className={inputCls} placeholder="application/json" />
              <button type="button" onClick={() => removeHeader(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {step.httpMethod !== 'GET' && (
        <div>
          <label className={labelCls}>Request Body (JSON)</label>
          <textarea value={step.httpBody} onChange={e => onChange({ httpBody: e.target.value })} className={`${inputCls} font-mono text-xs resize-none`} rows={5} placeholder='{"key": "value"}' />
        </div>
      )}
    </div>
  )
}

function StepConfigPanel({
  step, stepId, availableDeps, errors, onChange,
}: {
  step: StepForm; stepId: string
  availableDeps: Array<{ id: string; name: string }>
  errors: string[]; onChange: (patch: Partial<StepForm>) => void
}) {
  const toggleDep = (id: string) => {
    const next = step.dependencies.includes(id)
      ? step.dependencies.filter(d => d !== id)
      : [...step.dependencies, id]
    onChange({ dependencies: next })
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Step Configuration</h3>
        {errors.length > 0 && (
          <ul className="mt-2 space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className={labelCls}>Step Name *</label>
        <input value={step.name} onChange={e => onChange({ name: e.target.value })} className={inputCls} placeholder="Fetch User Data" required />
        {stepId && (
          <p className="mt-1 text-xs text-gray-400">
            ID: <code className="font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{stepId}</code>
          </p>
        )}
      </div>

      <div>
        <label className={labelCls}>Step Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(STEP_TYPE_META) as StepType[]).map(t => {
            const meta = STEP_TYPE_META[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ type: t })}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                  step.type === t
                    ? `border-indigo-400 ${meta.bg} ${meta.color}`
                    : 'border-gray-100 text-gray-500 hover:border-gray-200'
                }`}
              >
                {meta.icon}
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Type-specific config */}
      {step.type === 'http'      && <HttpConfigPanel step={step} onChange={onChange} />}
      {step.type === 'script'    && (
        <div>
          <label className={labelCls}>Bash Script</label>
          <textarea value={step.scriptCode} onChange={e => onChange({ scriptCode: e.target.value })} className={`${inputCls} font-mono text-xs resize-none`} rows={6} spellCheck={false} placeholder="echo 'Processing...'" />
          <p className="mt-1 text-xs text-gray-400">Input values are passed as environment variables: INPUT_KEY=value</p>
        </div>
      )}
      {step.type === 'delay'     && (
        <div>
          <label className={labelCls}>Duration</label>
          <input value={step.delayDuration} onChange={e => onChange({ delayDuration: e.target.value })} className={inputCls} placeholder="5s" />
          <p className="mt-1 text-xs text-gray-400">Examples: 30s, 5m, 1h</p>
        </div>
      )}
      {step.type === 'condition' && (
        <div>
          <label className={labelCls}>Expression</label>
          <input value={step.conditionExpr} onChange={e => onChange({ conditionExpr: e.target.value })} className={inputCls} placeholder='${status} == 200' />
          <p className="mt-1 text-xs text-gray-400">Format: {'${variable} == value'} or {'${variable} != value'}</p>
        </div>
      )}

      {/* Dependencies */}
      {availableDeps.length > 0 && (
        <div>
          <label className={labelCls}>Run After (depends on)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {availableDeps.map(dep => {
              const selected = step.dependencies.includes(dep.id)
              return (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => toggleDep(dep.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <code className="font-mono">{dep.id}</code>
                  {selected && <span className="opacity-70">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Modal ──────────────────────────────────────────────────────────────────

function AIGenerateModal({
  onClose, onGenerated,
}: {
  onClose: () => void
  onGenerated: (steps: StepForm[], suggestedName: string) => void
}) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await generateWorkflowWithAI(description)
      const rawSteps = (result.dag?.steps as Record<string, unknown>[]) ?? []
      const forms = rawSteps.map(dagStepToForm)
      const name = (result.dag?.name as string) || description.slice(0, 60)
      onGenerated(forms, name)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Generate with AI</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Describe your automation in plain language and FlowForge AI will create the steps for you.</p>
          <div>
            <label className={labelCls}>Describe your workflow</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={`${inputCls} resize-none`}
              rows={4}
              placeholder="Fetch user data from an API, filter active users, then send a Slack notification with the count..."
              autoFocus
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-0">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" onClick={generate} loading={loading} disabled={!description.trim() || loading}>
            <Sparkles className="w-3.5 h-3.5" />
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateWorkflowPage() {
  const navigate = useNavigate()
  const createMutation = useCreateWorkflow()

  // Workflow metadata
  const [wfName, setWfName]               = useState('')
  const [description, setDescription]     = useState('')
  const [triggerType, setTriggerType]     = useState<TriggerType>('manual')
  const [cronExpression, setCronExpression] = useState('')
  const [timeoutSec, setTimeoutSec]       = useState('')

  // Flow builder
  const [steps, setSteps]                 = useState<StepForm[]>([{ ...DEFAULT_STEP, name: 'Fetch Data' }])
  const [selectedNode, setSelectedNode]   = useState<'trigger' | number>('trigger')
  const [showAI, setShowAI]               = useState(false)
  const [globalError, setGlobalError]     = useState<string | null>(null)

  const stepIds = useMemo(() => steps.map(s => makeId(s.name)), [steps])

  // ── Validation ──
  const dagErrors = useMemo(() => {
    const errors: Record<number, string[]> = {}
    stepIds.forEach((id, i) => {
      const errs: string[] = []
      if (!id) errs.push('Name cannot be empty or contain only special characters')
      if (stepIds.filter(x => x === id).length > 1) errs.push(`ID "${id}" is duplicated — rename to make it unique`)
      steps[i].dependencies.forEach(dep => {
        if (!stepIds.includes(dep)) errs.push(`Dependency "${dep}" no longer exists`)
        if (dep === id) errs.push('Step cannot depend on itself')
      })
      if (steps[i].type === 'http' && !steps[i].httpUrl) errs.push('URL is required')
      if (steps[i].type === 'script' && !steps[i].scriptCode) errs.push('Script code is required')
      if (steps[i].type === 'delay' && !steps[i].delayDuration) errs.push('Duration is required')
      if (steps[i].type === 'condition' && !steps[i].conditionExpr) errs.push('Expression is required')
      if (errs.length) errors[i] = errs
    })
    return errors
  }, [steps, stepIds])

  const hasErrors = Object.keys(dagErrors).length > 0

  // ── Step mutations ──
  const addStep = useCallback((afterIdx?: number) => {
    const newStep: StepForm = { ...DEFAULT_STEP, name: `Step ${steps.length + 1}`, dependencies: [] }
    setSteps(prev => {
      if (afterIdx === undefined) return [...prev, newStep]
      const next = [...prev]
      next.splice(afterIdx + 1, 0, newStep)
      return next
    })
    const newIdx = afterIdx === undefined ? steps.length : afterIdx + 1
    setSelectedNode(newIdx)
  }, [steps.length])

  const removeStep = useCallback((idx: number) => {
    const removedId = stepIds[idx]
    setSteps(prev => prev
      .filter((_, i) => i !== idx)
      .map(s => ({ ...s, dependencies: s.dependencies.filter(d => d !== removedId) }))
    )
    setSelectedNode(prev => {
      if (prev === 'trigger') return 'trigger'
      if (prev === idx) return idx > 0 ? idx - 1 : 'trigger'
      return (prev as number) > idx ? (prev as number) - 1 : prev
    })
  }, [stepIds])

  const updateStep = useCallback((idx: number, patch: Partial<StepForm>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }, [])

  // ── AI generation ──
  const handleAIGenerated = (generatedSteps: StepForm[], suggestedName: string) => {
    setSteps(generatedSteps)
    if (!wfName && suggestedName) setWfName(suggestedName)
    setShowAI(false)
    setSelectedNode(generatedSteps.length > 0 ? 0 : 'trigger')
  }

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGlobalError(null)
    if (hasErrors) { setGlobalError('Fix the errors shown on each step before submitting.'); return }

    const dagSteps = steps.map((s, i) => ({
      id: stepIds[i],
      name: s.name,
      type: s.type,
      dependencies: s.dependencies,
      config: stepToDAGConfig(s),
    }))
    const dag: Record<string, unknown> = { steps: dagSteps }
    if (timeoutSec && !isNaN(Number(timeoutSec))) dag.timeout = Number(timeoutSec)

    try {
      const workflow = await createMutation.mutateAsync({
        name: wfName,
        description,
        dag: dag as any,
        ...(triggerType === 'cron' && cronExpression ? { cronExpression } : {}),
      })
      navigate(`/workflows/${workflow.id}`)
    } catch (err: any) {
      setGlobalError(err?.response?.data?.error || 'Failed to create workflow')
    }
  }

  const selectedStepIdx = selectedNode === 'trigger' ? null : (selectedNode as number)
  const selectedStep    = selectedStepIdx !== null ? steps[selectedStepIdx] : null

  return (
    <Layout title="New Workflow">
      <form onSubmit={handleSubmit}>
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/workflows')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold text-gray-900">New Workflow</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowAI(true)}>
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              AI Generate
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/workflows')}>Cancel</Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} disabled={hasErrors || !wfName}>
              Create Workflow
            </Button>
          </div>
        </div>

        {globalError && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {globalError}
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex gap-6 items-start">
          {/* Left: Flow builder */}
          <div className="w-80 flex-shrink-0 space-y-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Flow</p>

            <TriggerCard
              triggerType={triggerType}
              isSelected={selectedNode === 'trigger'}
              onSelect={() => setSelectedNode('trigger')}
              wfName={wfName}
            />

            {steps.map((step, idx) => (
              <div key={idx}>
                <AddStepButton onClick={() => addStep(idx - 1)} />
                <StepNodeCard
                  step={step}
                  idx={idx}
                  stepId={stepIds[idx]}
                  isSelected={selectedNode === idx}
                  hasError={!!dagErrors[idx]}
                  onSelect={() => setSelectedNode(idx)}
                  onDelete={() => removeStep(idx)}
                  canDelete={steps.length > 1}
                />
              </div>
            ))}

            <div className="flex flex-col items-center mt-1">
              <div className="w-px h-4 bg-gray-200" />
              <button
                type="button"
                onClick={() => addStep()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all w-full justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Step
              </button>
            </div>
          </div>

          {/* Right: Config panel */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 min-h-[480px]">
            {selectedNode === 'trigger' ? (
              <TriggerPanel
                wfName={wfName} setWfName={setWfName}
                description={description} setDescription={setDescription}
                triggerType={triggerType} setTriggerType={setTriggerType}
                cronExpression={cronExpression} setCronExpression={setCronExpression}
                timeoutSec={timeoutSec} setTimeoutSec={setTimeoutSec}
              />
            ) : selectedStep ? (
              <StepConfigPanel
                step={selectedStep}
                stepId={stepIds[selectedStepIdx!]}
                availableDeps={stepIds
                  .map((id, i) => ({ id, name: steps[i].name, i }))
                  .filter(({ i, id }) => i !== selectedStepIdx && id !== '')}
                errors={dagErrors[selectedStepIdx!] ?? []}
                onChange={patch => updateStep(selectedStepIdx!, patch)}
              />
            ) : null}
          </div>
        </div>
      </form>

      {showAI && <AIGenerateModal onClose={() => setShowAI(false)} onGenerated={handleAIGenerated} />}
    </Layout>
  )
}
