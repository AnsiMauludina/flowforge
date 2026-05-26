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
      <div className="space-y-8">
        {/* Health Panel */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Last 24 Hours
          </h2>
          <HealthPanel />
        </section>

        {/* Recent Workflows */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Recent Workflows
            </h2>
            <Link
              to="/workflows"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all →
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {!data?.data?.length ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm">
                  No workflows yet.{' '}
                  <Link to="/workflows" className="text-indigo-600 hover:underline font-medium">
                    Create one
                  </Link>
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Version
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Updated
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
                        <Badge
                          status={wf.isActive ? 'success' : ('cancelled' as RunStatus)}
                          label={wf.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400">
                        {new Date(wf.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
