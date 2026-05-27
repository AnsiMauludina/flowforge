import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Trash2, GitBranch, Search, X, CheckCircle, AlertCircle } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import {
  useWorkflows,
  useDeleteWorkflow,
  useTriggerWorkflow,
  type WorkflowFilter,
} from '@/hooks/useWorkflows'
import { useDebounce } from '@/hooks/useDebounce'

type StatusOption = '' | 'true' | 'false'

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

type Toast = { id: number; type: 'success' | 'error'; message: string }

export default function WorkflowsPage() {
  const [page, setPage] = useState(1)
  const [nameInput, setNameInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusOption>('')
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  // Debounce the name so we don't fire an API call on every keystroke
  const debouncedName = useDebounce(nameInput, 350)

  const filter: WorkflowFilter = {
    name: debouncedName || undefined,
    is_active: statusFilter || undefined,
  }

  const { data, isLoading } = useWorkflows(page, 20, filter)

  const deleteMutation = useDeleteWorkflow()
  const triggerMutation = useTriggerWorkflow()

  const handleDelete = useCallback((id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    deleteMutation.mutate(id, {
      onSuccess: () => addToast('success', `"${name}" deleted`),
      onError: () => addToast('error', `Failed to delete "${name}"`),
    })
  }, [deleteMutation, addToast])

  const handleTrigger = useCallback((id: string, name: string) => {
    triggerMutation.mutate(id, {
      onSuccess: () => addToast('success', `"${name}" triggered`),
      onError: () => addToast('error', `Failed to trigger "${name}"`),
    })
  }, [triggerMutation, addToast])

  // Reset to page 1 whenever filter changes
  const handleNameChange = useCallback((v: string) => {
    setNameInput(v)
    setPage(1)
  }, [])
  const handleStatusChange = useCallback((v: StatusOption) => {
    setStatusFilter(v)
    setPage(1)
  }, [])

  const hasFilter = nameInput !== '' || statusFilter !== ''
  const clearFilters = () => {
    setNameInput('')
    setStatusFilter('')
    setPage(1)
  }

  return (
    <Layout title="Workflows">
      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium
              transition-all animate-in slide-in-from-bottom-2 duration-200
              ${t.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-500 text-white'
              }`}
          >
            {t.type === 'success'
              ? <CheckCircle className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />
            }
            {t.message}
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-gray-700">{data?.total ?? 0}</span> workflows
            {hasFilter && ' found'}
          </p>
          <Link to="/workflows/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5" />
              New Workflow
            </Button>
          </Link>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search by name */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={nameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Search by name…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white
                         placeholder:text-gray-400 text-gray-800
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                         transition"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : !data?.data?.length ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GitBranch className="w-7 h-7 text-gray-300" />
            </div>
            {hasFilter ? (
              <>
                <h3 className="text-gray-800 font-semibold mb-1.5">No workflows match</h3>
                <p className="text-gray-400 text-sm mb-5">Try adjusting your filters</p>
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-gray-800 font-semibold mb-1.5">No workflows yet</h3>
                <p className="text-gray-400 text-sm mb-5">
                  Create your first workflow to get started
                </p>
                <Link to="/workflows/new">
                  <Button size="sm">
                    <Plus className="w-3.5 h-3.5" />
                    Create Workflow
                  </Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Workflow
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Version
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Schedule
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((wf) => (
                  <tr
                    key={wf.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/workflows/${wf.id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        {/* Highlight matching search term */}
                        {debouncedName
                          ? highlightMatch(wf.name, debouncedName)
                          : wf.name}
                      </Link>
                      {wf.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                          {wf.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                        v{wf.version}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-gray-400 font-mono">
                        {wf.cronExpression || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        status={wf.isActive ? 'success' : 'cancelled'}
                        label={wf.isActive ? 'Active' : 'Inactive'}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={triggerMutation.isPending && triggerMutation.variables === wf.id}
                          onClick={() => handleTrigger(wf.id, wf.name)}
                          title="Trigger run"
                          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={deleteMutation.isPending && deleteMutation.variables === wf.id}
                          onClick={() => handleDelete(wf.id, wf.name)}
                          title="Delete workflow"
                          className="text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {(data.total > 20) && (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-gray-400">
                  Page {page} of {Math.ceil(data.total / 20)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page * 20 >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

/** Wraps matched substring in a <mark> for visual highlighting. */
function highlightMatch(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-indigo-100 text-indigo-700 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}
