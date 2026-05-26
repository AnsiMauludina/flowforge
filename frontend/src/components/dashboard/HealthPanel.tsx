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
      iconClass: 'text-indigo-600',
      bgClass: 'bg-indigo-50',
      valueClass: 'text-indigo-700',
    },
    {
      label: 'Success Rate',
      value: `${(metrics?.successRate ?? 0).toFixed(1)}%`,
      icon: CheckCircle,
      iconClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      valueClass: 'text-emerald-700',
    },
    {
      label: 'Failure Rate',
      value: `${(metrics?.failureRate ?? 0).toFixed(1)}%`,
      icon: XCircle,
      iconClass: 'text-red-500',
      bgClass: 'bg-red-50',
      valueClass: 'text-red-600',
    },
    {
      label: 'Avg Duration',
      value: `${(metrics?.avgExecutionTime ?? 0).toFixed(1)}s`,
      icon: Clock,
      iconClass: 'text-amber-600',
      bgClass: 'bg-amber-50',
      valueClass: 'text-amber-700',
    },
    {
      label: 'Runs (24h)',
      value: metrics?.totalRuns24h ?? 0,
      icon: Zap,
      iconClass: 'text-violet-600',
      bgClass: 'bg-violet-50',
      valueClass: 'text-violet-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {cards.map(({ label, value, icon: Icon, iconClass, bgClass, valueClass }) => (
        <div
          key={label}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200"
        >
          <div className={`w-9 h-9 rounded-xl ${bgClass} flex items-center justify-center mb-4`}>
            <Icon className={`w-4.5 h-4.5 ${iconClass}`} />
          </div>
          <div className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</div>
          <div className="text-xs text-gray-400 mt-1 font-medium">{label}</div>
        </div>
      ))}
    </div>
  )
}
