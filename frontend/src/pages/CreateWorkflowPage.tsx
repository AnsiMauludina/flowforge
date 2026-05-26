import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import { useCreateWorkflow } from '@/hooks/useWorkflows'

const STEP_TYPES = ['http', 'script', 'delay', 'condition'] as const
type StepType = typeof STEP_TYPES[number]

interface StepForm {
  name: string
  type: StepType
  dependencies: string[] // array of step IDs
  config: string
  configError: string | null
}

// Derive a URL-safe ID from a step name — mirrors backend makeId logic
function makeId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

const defaultConfig: Record<StepType, string> = {
  http: JSON.stringify({ url: 'https://example.com', method: 'GET' }, null, 2),
  script: JSON.stringify({ code: 'return { result: "ok" }' }, null, 2),
  // backend validates key "duration", not "seconds"
  delay: JSON.stringify({ duration: '5s' }, null, 2),
  condition: JSON.stringify({ expression: 'true' }, null, 2),
}

const typeHints: Record<StepType, string> = {
  http: 'Required: url. Optional: method, headers, body',
  script: 'Required: code',
  delay: 'Required: duration (e.g. "5s", "1m")',
  condition: 'Required: expression (e.g. "true", "${status} == 200")',
}

function isValidJson(str: string): boolean {
  try { JSON.parse(str); return true } catch { return false }
}

export default function CreateWorkflowPage() {
  const navigate = useNavigate()
  const createMutation = useCreateWorkflow()

  const [wfName, setWfName] = useState('')
  const [description, setDescription] = useState('')
  const [cronExpression, setCronExpression] = useState('')
  const [timeoutSec, setTimeoutSec] = useState('')
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [steps, setSteps] = useState<StepForm[]>([
    { name: 'Fetch Data', type: 'http', dependencies: [], config: defaultConfig.http, configError: null },
  ])

  // Compute step IDs live from names
  const stepIds = useMemo(() => steps.map((s) => makeId(s.name)), [steps])

  // Client-side DAG validation
  const dagErrors = useMemo(() => {
    const errors: Record<number, string[]> = {}
    const idSet = new Set(stepIds)

    stepIds.forEach((id, i) => {
      const errs: string[] = []
      if (!id) errs.push('Step name cannot be empty or contain only special characters')

      // Duplicate ID check
      if (stepIds.filter((x) => x === id).length > 1)
        errs.push(`ID "${id}" is used by multiple steps — rename to make it unique`)

      // Dependency ID check
      steps[i].dependencies.forEach((dep) => {
        if (!idSet.has(dep))
          errs.push(`Dependency "${dep}" does not match any step ID`)
        if (dep === id)
          errs.push(`Step cannot depend on itself`)
      })

      // Config JSON check
      if (!isValidJson(steps[i].config))
        errs.push('Config is not valid JSON')

      if (errs.length) errors[i] = errs
    })
    return errors
  }, [steps, stepIds])

  const hasErrors = Object.keys(dagErrors).length > 0

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { name: `Step ${prev.length + 1}`, type: 'http', dependencies: [], config: defaultConfig.http, configError: null },
    ])

  const removeStep = (idx: number) =>
    setSteps((prev) => {
      const removedId = makeId(prev[idx].name)
      // Remove this step's ID from other steps' dependencies
      return prev
        .filter((_, i) => i !== idx)
        .map((s) => ({ ...s, dependencies: s.dependencies.filter((d) => d !== removedId) }))
    })

  const updateStep = (idx: number, patch: Partial<Omit<StepForm, 'configError'>>) =>
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s
        const updated = { ...s, ...patch, configError: null }
        if (patch.type && patch.type !== s.type) {
          updated.config = defaultConfig[patch.type]
        }
        return updated
      })
    )

  const toggleDependency = (stepIdx: number, depId: string) => {
    const current = steps[stepIdx].dependencies
    const next = current.includes(depId)
      ? current.filter((d) => d !== depId)
      : [...current, depId]
    updateStep(stepIdx, { dependencies: next })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGlobalError(null)

    if (hasErrors) {
      setGlobalError('Fix the errors below before submitting.')
      return
    }

    const parsedSteps = steps.map((s, i) => ({
      id: stepIds[i],
      name: s.name,
      type: s.type,
      config: JSON.parse(s.config),
      dependencies: s.dependencies,
    }))

    const dag: Record<string, unknown> = { steps: parsedSteps }
    if (timeoutSec && !isNaN(Number(timeoutSec))) dag.timeout = Number(timeoutSec)

    try {
      const workflow = await createMutation.mutateAsync({
        name: wfName,
        description,
        dag: dag as any,
        ...(cronExpression ? { cronExpression } : {}),
      })
      navigate(`/workflows/${workflow.id}`)
    } catch (err: any) {
      setGlobalError(err?.response?.data?.error || 'Failed to create workflow')
    }
  }

  const inputClass =
    'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50/60 ' +
    'placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ' +
    'focus:ring-indigo-500 focus:border-transparent transition-all duration-150'

  const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

  return (
    <Layout title="New Workflow">
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Header */}
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

        {/* Global error */}
        {globalError && (
          <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Basic Info</h3>

          <div>
            <label className={labelClass}>Name *</label>
            <input
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              className={inputClass}
              placeholder="Daily Report Pipeline"
              required
              minLength={3}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="What does this workflow do?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cron Expression</label>
              <input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className={inputClass}
                placeholder="0 * * * * (optional)"
              />
            </div>
            <div>
              <label className={labelClass}>Timeout (seconds)</label>
              <input
                type="number"
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(e.target.value)}
                className={inputClass}
                placeholder="300 (optional)"
                min={1}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Steps</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Dependencies use the computed step ID shown below each name.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={addStep}>
              <Plus className="w-3.5 h-3.5" />
              Add Step
            </Button>
          </div>

          {steps.map((step, idx) => {
            const computedId = stepIds[idx]
            const errs = dagErrors[idx] ?? []
            const hasStepError = errs.length > 0
            const availableDeps = stepIds
              .map((id, i) => ({ id, name: steps[i].name, i }))
              .filter(({ i, id }) => i !== idx && id !== computedId && id !== '')

            return (
              <div
                key={idx}
                className={`border rounded-xl p-4 space-y-3 transition-colors ${
                  hasStepError
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-gray-100 bg-slate-50/50'
                }`}
              >
                {/* Step header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                      hasStepError ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      Step {idx + 1}
                    </span>
                    {hasStepError
                      ? <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                      : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    }
                  </div>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Step-level errors */}
                {hasStepError && (
                  <ul className="space-y-1">
                    {errs.map((e, ei) => (
                      <li key={ei} className="text-xs text-red-600 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      value={step.name}
                      onChange={(e) => updateStep(idx, { name: e.target.value })}
                      className={inputClass}
                      placeholder="Fetch Data"
                      required
                    />
                    {/* Live ID preview */}
                    <p className="mt-1 text-xs text-gray-400">
                      ID:{' '}
                      <code className={`font-mono px-1.5 py-0.5 rounded ${
                        computedId
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'bg-red-50 text-red-500'
                      }`}>
                        {computedId || '(empty — fix name)'}
                      </code>
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <div className="relative">
                      <select
                        value={step.type}
                        onChange={(e) => updateStep(idx, { type: e.target.value as StepType })}
                        className={`${inputClass} appearance-none pr-8`}
                      >
                        {STEP_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{typeHints[step.type]}</p>
                  </div>
                </div>

                {/* Dependencies — checkboxes of available steps */}
                <div>
                  <label className={labelClass}>
                    Depends On
                    <span className="ml-1 font-normal text-gray-400 normal-case">
                      (must complete before this step runs)
                    </span>
                  </label>
                  {availableDeps.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No other steps available yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {availableDeps.map(({ id, name }) => {
                        const selected = step.dependencies.includes(id)
                        const isInvalidDep = !stepIds.includes(id) && step.dependencies.includes(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleDependency(idx, id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                              selected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : isInvalidDep
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                          >
                            <code className="font-mono">{id}</code>
                            {selected && <span className="text-indigo-200">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {/* Show currently selected that may have become invalid */}
                  {step.dependencies.filter((d) => !stepIds.includes(d)).map((d) => (
                    <div key={d} className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>
                        <code className="font-mono">"{d}"</code> no longer exists — click to remove
                      </span>
                      <button
                        type="button"
                        onClick={() => updateStep(idx, {
                          dependencies: step.dependencies.filter((x) => x !== d)
                        })}
                        className="ml-1 text-red-400 hover:text-red-600 underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                {/* Config */}
                <div>
                  <label className={labelClass}>Config (JSON)</label>
                  <textarea
                    value={step.config}
                    onChange={(e) => updateStep(idx, { config: e.target.value })}
                    className={`${inputClass} font-mono text-xs resize-none ${
                      !isValidJson(step.config) ? 'border-red-300 focus:ring-red-400 bg-red-50/50' : ''
                    }`}
                    rows={4}
                    spellCheck={false}
                    required
                  />
                  {!isValidJson(step.config) && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Invalid JSON
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* DAG summary */}
        {steps.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Execution Order Preview
            </h3>
            <div className="space-y-1.5">
              {steps.map((s, i) => {
                const id = stepIds[i]
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <code className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md w-40 truncate">
                      {id || '?'}
                    </code>
                    {s.dependencies.length > 0 ? (
                      <span className="text-gray-400 text-xs">
                        after{' '}
                        {s.dependencies.map((d, di) => (
                          <span key={di}>
                            {di > 0 && <span className="text-gray-300"> + </span>}
                            <code className={`font-mono px-1 py-0.5 rounded text-xs ${
                              stepIds.includes(d)
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-red-50 text-red-500'
                            }`}>{d}</code>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">runs immediately (no dependencies)</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button type="button" variant="secondary" onClick={() => navigate('/workflows')}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending}
            disabled={hasErrors}
            title={hasErrors ? 'Fix errors above before submitting' : undefined}
          >
            Create Workflow
          </Button>
        </div>
      </form>
    </Layout>
  )
}
