import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, ArrowLeft, Clock, GitBranch } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import Button from '@/components/ui/Button'
import DAGViewer from '@/components/workflow/DAGViewer'
import RunHistory from '@/components/dashboard/RunHistory'
import LiveMonitor from '@/components/dashboard/LiveMonitor'
import Spinner from '@/components/ui/Spinner'
import { useWorkflowStore } from '@/store/workflowStore'
import {
  useWorkflow,
  useWorkflowRuns,
  useTriggerWorkflow,
} from '@/hooks/useWorkflows'
import type { WorkflowRun } from '@/types'

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [runsPage, setRunsPage] = useState(1)

  const { data: workflow, isLoading } = useWorkflow(id!)
  const { data: runsData } = useWorkflowRuns(id!, runsPage)
  const triggerMutation = useTriggerWorkflow()
  const { stepRuns } = useWorkflowStore()

  const handleTrigger = async () => {
    const result = await triggerMutation.mutateAsync(id!)
    if (result.run_id) {
      setSelectedRun({
        id: result.run_id,
        workflowId: id!,
        tenantId: '',
        status: 'pending',
        triggerType: 'manual',
        createdAt: new Date().toISOString(),
      })
    }
  }

  if (isLoading) {
    return (
      <Layout title="Workflow">
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      </Layout>
    )
  }

  if (!workflow) {
    return (
      <Layout title="Workflow">
        <div className="text-center py-24 text-gray-400 text-sm">
          Workflow not found
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={workflow.name}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/workflows')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{workflow.name}</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  v{workflow.version}
                </span>
                {workflow.cronExpression && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <code className="font-mono">{workflow.cronExpression}</code>
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={handleTrigger}
            loading={triggerMutation.isPending}
            size="sm"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Run
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* DAG Viewer */}
          <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Workflow Graph</h3>
              <span className="text-xs text-gray-400">
                {workflow.dag?.steps?.length ?? 0} steps
              </span>
            </div>
            <div style={{ height: 420 }}>
              <DAGViewer
                dag={workflow.dag}
                stepRuns={selectedRun ? stepRuns : {}}
              />
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Live Monitor */}
            {selectedRun && (
              <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm shadow-indigo-50 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-indigo-50 flex items-center justify-between bg-indigo-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-indigo-700">Live Monitor</h3>
                  </div>
                  <button
                    onClick={() => setSelectedRun(null)}
                    className="text-xs text-indigo-400 hover:text-indigo-600 font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
                <div className="p-4 max-h-64 overflow-y-auto">
                  <LiveMonitor run={selectedRun} />
                </div>
              </div>
            )}

            {/* Run History */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Run History</h3>
                {runsData && (
                  <span className="text-xs text-gray-400">{runsData.total} runs</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                <RunHistory
                  runs={runsData?.data ?? []}
                  selectedRunId={selectedRun?.id}
                  onSelectRun={setSelectedRun}
                />
              </div>
              {runsData && runsData.total > 20 && (
                <div className="flex justify-between items-center px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                  <button
                    disabled={runsPage === 1}
                    onClick={() => setRunsPage((p) => p - 1)}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 font-medium transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-300">Page {runsPage}</span>
                  <button
                    disabled={runsPage * 20 >= runsData.total}
                    onClick={() => setRunsPage((p) => p + 1)}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Workflow Info
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Steps', value: workflow.dag?.steps?.length ?? 0 },
              { label: 'Version', value: `v${workflow.version}` },
              {
                label: 'Timeout',
                value: workflow.dag?.timeout ? `${workflow.dag.timeout}s` : 'Default',
              },
              {
                label: 'Created',
                value: new Date(workflow.createdAt).toLocaleDateString(),
              },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-1 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>
          {workflow.description && (
            <p className="mt-4 text-sm text-gray-500 border-t border-gray-100 pt-4">
              {workflow.description}
            </p>
          )}
        </div>
      </div>
    </Layout>
  )
}
