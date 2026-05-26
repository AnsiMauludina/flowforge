import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Play, Trash2, GitBranch } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import {
  useWorkflows,
  useDeleteWorkflow,
  useTriggerWorkflow,
} from '@/hooks/useWorkflows'

export default function WorkflowsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useWorkflows(page)
  const deleteMutation = useDeleteWorkflow()
  const triggerMutation = useTriggerWorkflow()

  return (
    <Layout title="Workflows">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-gray-700">{data?.total ?? 0}</span> workflows total
          </p>
          <Link to="/workflows/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5" />
              New Workflow
            </Button>
          </Link>
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
                        {wf.name}
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
                          loading={triggerMutation.isPending}
                          onClick={() => triggerMutation.mutate(wf.id)}
                          title="Trigger run"
                          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm('Delete this workflow?')) {
                              deleteMutation.mutate(wf.id)
                            }
                          }}
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
            {data.total > 20 && (
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
