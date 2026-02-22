import type { Edge } from 'reactflow'
import type {
  ActionNode,
  AudioEventNode,
  ValueSource,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { YargEventType } from '../../../../../photonics-dmx/types'
import type { EditorNode } from './types'
import { createDefaultActionTiming } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { AUDIO_EVENT_OPTIONS, YARG_EVENT_OPTIONS } from './options'

// Helper to display ValueSource as text
const displayValueSource = (vs: ValueSource | undefined, defaultValue: string = ''): string => {
  if (!vs) return defaultValue
  if (vs.source === 'literal') {
    return String(vs.value ?? defaultValue)
  }
  return `$${vs.name}`
}

const getYargEventLabel = (eventType: YargEventType): string =>
  YARG_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find((option) => option.value === eventType)?.label ?? eventType

const getConditionLabel = (condition: string, timeSource?: ValueSource): string => {
  if (!condition) return 'none'
  if (condition === 'delay') {
    const timeText = displayValueSource(timeSource, '0')
    return `delay [${timeText}ms]`
  }
  return condition
}

const getTextColorForBg = (name: string): string => {
  const lightish = ['white', 'yellow', 'amber', 'chartreuse', 'cyan', 'transparent']
  return lightish.includes(name) ? '#111827' : '#f9fafb'
}

const calculateActionDuration = (action: ActionNode): number => {
  const timing = action.timing ?? createDefaultActionTiming()
  const getValue = (valueSource: {
    source: 'literal' | 'variable'
    value?: number | boolean | string | unknown[]
    name?: string
  }): number => {
    if (valueSource.source === 'literal' && typeof valueSource.value === 'number') {
      return valueSource.value
    }
    return 0 // Default for variable sources or non-number literals
  }
  return (
    Math.max(0, getValue(timing.waitForTime)) +
    Math.max(0, getValue(timing.duration)) +
    Math.max(0, getValue(timing.waitUntilTime))
  )
}

const calculateChainDuration = (nodes: EditorNode[], edges: Edge[]): number => {
  const eventNodes = nodes.filter((n) => n.data.kind === 'event')
  const actionNodes = nodes.filter((n) => n.data.kind === 'action')
  const logicNodes = nodes.filter((n) => n.data.kind === 'logic')

  if (eventNodes.length === 0 || actionNodes.length === 0) return 0

  const actionMap = new Map(actionNodes.map((n) => [n.id, n.data.payload as ActionNode]))
  const logicSet = new Set(logicNodes.map((n) => n.id))
  const adjacency = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = adjacency.get(edge.source) ?? []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  })

  let maxEndTime = 0

  const traverse = (nodeId: string, cumulativeDelay: number, visited: Set<string>): void => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    if (actionMap.has(nodeId)) {
      const action = actionMap.get(nodeId)!
      const duration = calculateActionDuration(action)
      const endTime = cumulativeDelay + duration
      if (endTime > maxEndTime) maxEndTime = endTime

      const nextNodes = adjacency.get(nodeId) ?? []
      for (const nextId of nextNodes) {
        traverse(nextId, endTime, new Set(visited))
      }
      return
    }

    if (logicSet.has(nodeId)) {
      const nextNodes = adjacency.get(nodeId) ?? []
      for (const nextId of nextNodes) {
        traverse(nextId, cumulativeDelay, new Set(visited))
      }
    }
  }

  for (const eventNode of eventNodes) {
    const roots = adjacency.get(eventNode.id) ?? []
    for (const nodeId of roots) {
      traverse(nodeId, 0, new Set())
    }
  }

  return maxEndTime
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export {
  calculateActionDuration,
  calculateChainDuration,
  displayValueSource,
  formatDuration,
  getAudioEventLabel,
  getConditionLabel,
  getTextColorForBg,
  getYargEventLabel,
}
