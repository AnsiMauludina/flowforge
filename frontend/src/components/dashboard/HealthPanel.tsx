import { Activity, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'
import { useHealthMetrics } from '@/hooks/useWorkflows'
import Spinner from '@/components/ui/Spinner'

export default function HealthPanel() {
  const { data: metrics, isLoading } = useHealthMetrics()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner />
      </div>
    )
  }

  const cards = [
    {
      label: 'Active Runs',
      value: metrics?.activeRuns ?? 0,
      icon: Activity,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Success Rate',
      value: `${(metrics?.successRate ?? 0).toFixed(1)}%`,
      icon: CheckCircle,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Failure Rate',
      value: `${(metrics?.failureRate ?? 0).toFixed(1)}%`,
      icon: XCircle,
      color: 'text-red-600 bg-red-50',
    },
    {
      label: 'Avg Duration',
      value: `${(metrics?.avgExecutionTime ?? 0).toFixed(1)}s`,
      icon: Clock,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'Runs (24h)',
      value: metrics?.totalRuns24h ?? 0,
      icon: Zap,
      color: 'text-purple-600 bg-purple-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="bg-white rounded-xl border border-gray-200 p-4"
        >
          <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}