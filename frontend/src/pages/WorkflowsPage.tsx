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
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {data?.total ?? 0} workflows total
          </p>
          <Link to="/workflows/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              New Workflow
            </Button>
          </Link>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : !data?.data?.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <GitBranch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-900 font-medium mb-1">No workflows yet</h3>
            <p className="text-gray-400 text-sm mb-4">
              Create your first workflow to get started
            </p>
            <Link to="/workflows/new">
              <Button size="sm">
                <Plus className="w-4 h-4" />
                Create Workflow
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Workflow</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Schedule</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((wf) => (
                  <tr key={wf.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/workflows/${wf.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{wf.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">v{wf.version}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {wf.cronExpression || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        status={wf.isActive ? 'success' : 'cancelled'}
                        label={wf.isActive ? 'Active' : 'Inactive'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={triggerMutation.isPending}
                          onClick={() => triggerMutation.mutate(wf.id)}
                          title="Trigger"
                        >
                          <Play className="w-3.5 h-3.5 text-green-600" />
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
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.total > 20 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
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