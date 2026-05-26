import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Badge from '@/components/ui/Badge'
import type { StepStatus } from '@/types'

interface StepNodeData {
  label: string
  type: string
  status?: StepStatus
  attempt?: number
  error?: string
}

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  http:      { bg: 'bg-sky-50',    text: 'text-sky-600',    label: '🌐 HTTP' },
  script:    { bg: 'bg-violet-50', text: 'text-violet-600', label: '⚡ Script' },
  delay:     { bg: 'bg-amber-50',  text: 'text-amber-600',  label: '⏱ Delay' },
  condition: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: '🔀 Condition' },
}

const statusBorder: Record<string, string> = {
  running: 'border-indigo-400 shadow-md shadow-indigo-100',
  success: 'border-emerald-400',
  failed:  'border-red-400',
  pending: 'border-gray-200',
}

function StepNode({ data }: NodeProps) {
  const nodeData = data as unknown as StepNodeData
  const type = typeConfig[nodeData.type] ?? {
    bg: 'bg-gray-50', text: 'text-gray-500', label: `📦 ${nodeData.type}`,
  }
  const border = nodeData.status ? (statusBorder[nodeData.status] ?? 'border-gray-200') : 'border-gray-200'

  return (
    <div
      className={`min-w-[164px] rounded-xl border-2 bg-white shadow-sm transition-all duration-200 ${border}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !border-white !w-2 !h-2" />

      {/* Type header */}
      <div className={`px-3 py-1.5 rounded-t-xl flex items-center gap-1.5 ${type.bg}`}>
        <span className={`text-xs font-semibold ${type.text}`}>{type.label}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900 truncate max-w-[148px]">
          {nodeData.label}
        </p>

        {nodeData.status && (
          <div className="mt-2 flex items-center justify-between">
            <Badge
              status={nodeData.status as 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'}
            />
            {nodeData.attempt && nodeData.attempt > 1 && (
              <span className="text-xs text-gray-300">#{nodeData.attempt}</span>
            )}
          </div>
        )}

        {nodeData.status === 'failed' && nodeData.error && (
          <p className="mt-1.5 text-xs text-red-500 truncate max-w-[148px]">
            {nodeData.error}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-300 !border-white !w-2 !h-2" />
    </div>
  )
}

export default memo(StepNode)
