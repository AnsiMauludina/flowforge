interface BadgeProps {
    status: 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
    label?: string
  }
  
  const statusConfig = {
    pending:   { color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
    running:   { color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500 animate-pulse' },
    success:   { color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    failed:    { color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    timeout:   { color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
    cancelled: { color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
  }
  
  export default function Badge({ status, label }: BadgeProps) {
    const config = statusConfig[status] ?? statusConfig.pending
  
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {label ?? status}
      </span>
    )
  }