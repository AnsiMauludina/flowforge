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
    // Auto-select the new run for monitoring
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
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </Layout>
    )
  }

  if (!workflow) {
    return (
      <Layout title="Workflow">
        <div className="text-center py-20 text-gray-400">
          Workflow not found
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={workflow.name}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/workflows')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {workflow.name}
              </h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  v{workflow.version}
                </span>
                {workflow.cronExpression && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {workflow.cronExpression}
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
            <Play className="w-4 h-4" />
            Trigger Run
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* DAG Viewer — 2/3 width */}
          <div className="col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">
                Workflow Graph
              </h3>
            </div>
            <div style={{ height: 420 }}>
              <DAGViewer
                dag={workflow.dag}
                stepRuns={selectedRun ? stepRuns : {}}
              />
            </div>
          </div>

          {/* Right panel — 1/3 width */}
          <div className="space-y-4">
            {/* Live Monitor */}
            {selectedRun && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">
                    Live Monitor
                  </h3>
                  <button
                    onClick={() => setSelectedRun(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">
                  Run History
                </h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <RunHistory
                  runs={runsData?.data ?? []}
                  selectedRunId={selectedRun?.id}
                  onSelectRun={setSelectedRun}
                />
              </div>
              {runsData && runsData.total > 20 && (
                <div className="flex justify-between px-4 py-2 border-t border-gray-100">
                  <button
                    disabled={runsPage === 1}
                    onClick={() => setRunsPage((p) => p - 1)}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-400">
                    Page {runsPage}
                  </span>
                  <button
                    disabled={runsPage * 20 >= runsData.total}
                    onClick={() => setRunsPage((p) => p + 1)}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Workflow Info
          </h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Steps</p>
              <p className="font-medium text-gray-900">
                {workflow.dag?.steps?.length ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Version</p>
              <p className="font-medium text-gray-900">v{workflow.version}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Timeout</p>
              <p className="font-medium text-gray-900">
                {workflow.dag?.timeout
                  ? `${workflow.dag.timeout}s`
                  : 'Default'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Created</p>
              <p className="font-medium text-gray-900">
                {new Date(workflow.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {workflow.description && (
            <p className="mt-3 text-sm text-gray-500">{workflow.description}</p>
          )}
        </div>
      </div>
    </Layout>
  )
}