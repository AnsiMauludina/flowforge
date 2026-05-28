import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import StepNode from './StepNode'
import type { DAGDefinition, StepRun } from '@/types'

interface DAGViewerProps {
  dag: DAGDefinition
  stepRuns?: Record<string, StepRun>
}

const nodeTypes = { step: StepNode }

function buildLayout(dag: DAGDefinition) {
  // Simple level-based layout
  const levels: Record<string, number> = {}
  const positions: Record<string, { x: number; y: number }> = {}

  // Calculate level for each step (topological)
  const inDegree: Record<string, number> = {}
  dag.steps.forEach((s) => { inDegree[s.id] = 0 })
  dag.steps.forEach((s) => {
    s.dependencies.forEach(() => {
      inDegree[s.id] = (inDegree[s.id] || 0) + 1
    })
  })

  // BFS to assign levels
  const queue = dag.steps
    .filter((s) => (inDegree[s.id] || 0) === 0)
    .map((s) => s.id)

  queue.forEach((id) => { levels[id] = 0 })

  let i = 0
  while (i < queue.length) {
    const current = queue[i++]
    const currentLevel = levels[current]

    dag.steps
      .filter((s) => s.dependencies.includes(current))
      .forEach((s) => {
        levels[s.id] = Math.max(levels[s.id] ?? 0, currentLevel + 1)
        if (!queue.includes(s.id)) queue.push(s.id)
      })
  }

  // Group by level
  const levelGroups: Record<number, string[]> = {}
  Object.entries(levels).forEach(([id, level]) => {
    if (!levelGroups[level]) levelGroups[level] = []
    levelGroups[level].push(id)
  })

  // Assign x, y positions
  const X_GAP = 220
  const Y_GAP = 140

  Object.entries(levelGroups).forEach(([level, ids]) => {
    const totalWidth = (ids.length - 1) * X_GAP
    ids.forEach((id, idx) => {
      positions[id] = {
        x: idx * X_GAP - totalWidth / 2 + 300,
        y: Number(level) * Y_GAP + 50,
      }
    })
  })

  return positions
}

export default function DAGViewer({ dag, stepRuns = {} }: DAGViewerProps) {
  const { nodes, edges } = useMemo(() => {
    if (!dag?.steps?.length) return { nodes: [], edges: [] }

    const positions = buildLayout(dag)

    const nodes: Node[] = dag.steps.map((step) => {
      const run = stepRuns[step.id]
      return {
        id: step.id,
        type: 'step',
        position: positions[step.id] ?? { x: 0, y: 0 },
        data: {
          label:   step.name,
          type:    step.type,
          status:  run?.status,
          attempt: run?.attempt,
          error:   run?.error,
        },
      }
    })

    const edges: Edge[] = []
    dag.steps.forEach((step) => {
      step.dependencies.forEach((depID) => {
        edges.push({
          id:           `${depID}->${step.id}`,
          source:       depID,
          target:       step.id,
          type:         'smoothstep',
          animated:     stepRuns[depID]?.status === 'running',
          markerEnd:    { type: MarkerType.ArrowClosed },
          style:        { stroke: '#94a3b8', strokeWidth: 1.5 },
        })
      })
    })

    return { nodes, edges }
  }, [dag, stepRuns])

  if (!dag?.steps?.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No steps defined
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ 
        hideAttribution: true
      }}

    >
      <Background color="#e2e8f0" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}