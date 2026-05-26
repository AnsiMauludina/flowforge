interface BadgeProps {
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
  label?: string
}

const statusConfig = {
  pending:   { color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
  running:   { color: 'bg-indigo-50 text-indigo-600', dot: 'bg-indigo-500 animate-pulse' },
  success:   { color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  failed:    { color: 'bg-red-50 text-red-600',       dot: 'bg-red-500' },
  timeout:   { color: 'bg-amber-50 text-amber-600',   dot: 'bg-amber-500' },
  cancelled: { color: 'bg-gray-100 text-gray-400',    dot: 'bg-gray-300' },
}

export default function Badge({ status, label }: BadgeProps) {
  const config = statusConfig[status] ?? statusConfig.pending

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {label ?? status}
    </span>
  )
}
