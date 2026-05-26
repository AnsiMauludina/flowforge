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

const typeColors: Record<string, string> = {
  http:      'bg-blue-50 border-blue-200 text-blue-700',
  script:    'bg-purple-50 border-purple-200 text-purple-700',
  delay:     'bg-orange-50 border-orange-200 text-orange-700',
  condition: 'bg-yellow-50 border-yellow-200 text-yellow-700',
}

const typeIcons: Record<string, string> = {
  http:      '🌐',
  script:    '⚡',
  delay:     '⏱',
  condition: '🔀',
}

function StepNode({ data }: NodeProps) {
  const nodeData = data as unknown as StepNodeData
  const colorClass = typeColors[nodeData.type] ?? 'bg-gray-50 border-gray-200 text-gray-700'

  return (
    <div
      className={`
        min-w-[160px] rounded-xl border-2 shadow-sm bg-white
        ${nodeData.status === 'running' ? 'border-blue-400 shadow-blue-100 shadow-md' : ''}
        ${nodeData.status === 'success' ? 'border-green-400' : ''}
        ${nodeData.status === 'failed'  ? 'border-red-400' : ''}
        ${!nodeData.status              ? 'border-gray-200' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div className={`px-3 py-1.5 rounded-t-xl text-xs font-medium flex items-center gap-1.5 ${colorClass}`}>
        <span>{typeIcons[nodeData.type] ?? '📦'}</span>
        <span className="uppercase tracking-wide">{nodeData.type}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">
          {nodeData.label}
        </p>

        {nodeData.status && (
          <div className="mt-2 flex items-center justify-between">
            <Badge status={nodeData.status as 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'} />
            {nodeData.attempt && nodeData.attempt > 1 && (
              <span className="text-xs text-gray-400">
                attempt {nodeData.attempt}
              </span>
            )}
          </div>
        )}

        {nodeData.status === 'failed' && nodeData.error && (
          <p className="mt-1.5 text-xs text-red-500 truncate max-w-[140px]">
            {nodeData.error}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
}

export default memo(StepNode)