import Layout from '@/components/layout/Layout'
import HealthPanel from '@/components/dashboard/HealthPanel'
import { useWorkflows } from '@/hooks/useWorkflows'
import { Link } from 'react-router-dom'
import Badge from '@/components/ui/Badge'
import type { RunStatus } from '@/types'

export default function DashboardPage() {
  const { data } = useWorkflows(1, 5)

  return (
    <Layout title="Dashboard">
      <div className="space-y-6">
        {/* Health Panel */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Last 24 Hours
          </h2>
          <HealthPanel />
        </div>

        {/* Recent Workflows */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Recent Workflows
            </h2>
            <Link
              to="/workflows"
              className="text-sm text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {!data?.data?.length ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No workflows yet.{' '}
                <Link to="/workflows" className="text-blue-600 hover:underline">
                  Create one
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Version
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Updated
                    </th>
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
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                            {wf.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">v{wf.version}</td>
                      <td className="px-4 py-3">
                        <Badge
                          status={wf.isActive ? 'success' : 'cancelled'}
                          label={wf.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(wf.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}