import React, { useCallback, useEffect, useState } from 'react'
import type { ReactFlowInstance } from 'reactflow'
import type {
  VariableDefinition,
  ValueSource,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EffectDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNodeData } from '../lib/types'
import { cueToFlow, effectToFlow } from '../lib/cueTransforms'
import type {
  YargNodeCueDefinition,
  AudioNodeCueDefinition,
  YargEffectDefinition,
  AudioEffectDefinition,
  EffectRaiserNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

export type UseFlowSyncParams = {
  setNodes: React.Dispatch<React.SetStateAction<import('reactflow').Node<EditorNodeData>[]>>
  setEdges: React.Dispatch<React.SetStateAction<import('reactflow').Edge[]>>
  effectDefinitions?: Map<string, EffectDefinition>
  onCueLoaded?: () => void
}

const areParameterDefinitionsEqual = (
  left?: VariableDefinition[],
  right?: VariableDefinition[],
): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  if (left.length !== right.length) return false
  return left.every((leftDef, index) => {
    const rightDef = right[index]
    if (!rightDef) return false
    return (
      leftDef.name === rightDef.name &&
      leftDef.type === rightDef.type &&
      leftDef.scope === rightDef.scope &&
      leftDef.isParameter === rightDef.isParameter &&
      leftDef.description === rightDef.description &&
      leftDef.initialValue === rightDef.initialValue
    )
  })
}

const buildDefaultValueSource = (def: VariableDefinition): ValueSource => ({
  source: 'literal',
  value: def.initialValue,
})

export function useFlowSync({
  setNodes,
  setEdges,
  effectDefinitions,
  onCueLoaded,
}: UseFlowSyncParams) {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  useEffect(() => {
    if (!effectDefinitions || effectDefinitions.size === 0) return

    setNodes((prevNodes) => {
      let didChange = false
      const nextNodes = prevNodes.map((node) => {
        if (node.data.kind !== 'effect-raiser') return node
        const raiser = node.data.payload as EffectRaiserNode
        if (!raiser.effectId) return node

        const effectDef = effectDefinitions.get(raiser.effectId)
        if (!effectDef) return node

        const parameterDefinitions = effectDef.variables?.filter((v) => v.isParameter) ?? []
        const existingDefinitions = node.data.parameterDefinitions
        const definitionsChanged = !areParameterDefinitionsEqual(
          existingDefinitions,
          parameterDefinitions,
        )

        const parameterNames = new Set(parameterDefinitions.map((def) => def.name))
        const nextParameterValues: Record<string, ValueSource> = {}
        let valuesChanged = false
        for (const [paramName, paramValue] of Object.entries(raiser.parameterValues ?? {})) {
          if (parameterNames.has(paramName)) {
            nextParameterValues[paramName] = paramValue
          } else {
            valuesChanged = true
          }
        }
        for (const paramDef of parameterDefinitions) {
          if (nextParameterValues[paramDef.name] === undefined) {
            nextParameterValues[paramDef.name] = buildDefaultValueSource(paramDef)
            valuesChanged = true
          }
        }

        const nextEffectName = effectDef.name || node.data.effectName || raiser.effectId || 'none'
        const effectNameChanged = nextEffectName !== node.data.effectName

        if (!definitionsChanged && !valuesChanged && !effectNameChanged) {
          return node
        }

        didChange = true
        return {
          ...node,
          data: {
            ...node.data,
            label: `Effect: ${nextEffectName}`,
            payload: valuesChanged ? { ...raiser, parameterValues: nextParameterValues } : raiser,
            effectName: nextEffectName,
            parameterDefinitions,
          },
        }
      })

      return didChange ? nextNodes : prevNodes
    })
  }, [effectDefinitions, setNodes])

  const loadCueIntoFlow = useCallback(
    (
      cue:
        | YargNodeCueDefinition
        | AudioNodeCueDefinition
        | YargEffectDefinition
        | AudioEffectDefinition
        | null,
    ) => {
      const isEffect = cue != null && 'mode' in cue && (cue.mode === 'yarg' || cue.mode === 'audio')

      const { nodes: flowNodes, edges: flowEdges } = isEffect
        ? effectToFlow(cue as YargEffectDefinition | AudioEffectDefinition)
        : cueToFlow(cue as YargNodeCueDefinition | AudioNodeCueDefinition | null, effectDefinitions)

      setNodes(flowNodes)
      setEdges(flowEdges)
      onCueLoaded?.()
    },
    [setEdges, setNodes, effectDefinitions, onCueLoaded],
  )

  return { loadCueIntoFlow, reactFlowInstance, setReactFlowInstance }
}
