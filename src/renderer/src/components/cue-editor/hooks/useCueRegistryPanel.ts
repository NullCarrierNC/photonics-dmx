import { useCallback, useMemo, useState } from 'react'
import type { Node } from 'reactflow'
import type {
  NodeCueMode,
  NodeCueFile,
  VariableDefinition,
  EventDefinition,
  EffectReference,
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { enrichAvailableVariables } from '../lib/availableVariables'
import { collectEventReferences, collectVariableReferences } from '../lib/graphReferences'

type EditorDoc = EditorDocument | null
type EffectDefinition = YargEffectDefinition | AudioEffectDefinition | null

interface UseCueRegistryPanelArgs {
  editorDoc: EditorDoc
  selectedCueId: string | null
  activeMode: NodeCueMode
  nodes: Node[]
  currentEffectDefinition: EffectDefinition
  /** Effect definitions loaded for the effects this cue references, keyed by effect id. */
  loadedEffectDefinitions: Map<string, YargEffectDefinition | AudioEffectDefinition>
  updateGroupMeta(patch: Record<string, unknown>): void
  updateCueMetadata(patch: Record<string, unknown>): void
  updateEffectMetadata(patch: Record<string, unknown>): void
}

/**
 * The cue editor's registry panel: which tab is showing, the variable, event and effect lists it
 * derives from the current document, and the mutations that write edits back.
 *
 * Cue mode splits variables across the group and the selected cue; effect mode has one
 * cue-scoped list on the effect itself, and no events or effects of its own.
 */
export function useCueRegistryPanel({
  editorDoc,
  selectedCueId,
  activeMode,
  nodes,
  currentEffectDefinition,
  loadedEffectDefinitions,
  updateGroupMeta,
  updateCueMetadata,
  updateEffectMetadata,
}: UseCueRegistryPanelArgs) {
  const [registryTab, setRegistryTab] = useState<'variables' | 'events' | 'effects'>('variables')

  const handleVariablesChange = useCallback(
    (groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => {
      if (!editorDoc) return

      if (editorDoc.mode === 'effect') {
        // In effect mode, cueVars are actually effect variables
        updateEffectMetadata({ variables: cueVars })
      } else {
        // In cue mode, update both group and cue variables
        updateGroupMeta({ variables: groupVars })

        if (selectedCueId) {
          updateCueMetadata({ variables: cueVars })
        }
      }
    },
    [editorDoc, selectedCueId, updateGroupMeta, updateCueMetadata, updateEffectMetadata],
  )

  const handleSyncVariableValidValues = useCallback(
    (varName: string, scope: 'cue' | 'cue-group', validValues: string[]) => {
      if (!editorDoc) return

      if (editorDoc.mode === 'effect') {
        const vars = (currentEffectDefinition?.variables ?? []).map((v) =>
          v.name === varName ? { ...v, validValues: [...validValues] } : v,
        )
        updateEffectMetadata({ variables: vars })
      } else {
        const cueFile = editorDoc.file as NodeCueFile
        if (scope === 'cue-group') {
          const groupVars = (cueFile.group.variables ?? []).map((v) =>
            v.name === varName ? { ...v, validValues: [...validValues] } : v,
          )
          updateGroupMeta({ variables: groupVars })
        } else {
          if (!selectedCueId) return
          const cueVars = (cueFile.cues.find((c) => c.id === selectedCueId)?.variables ?? []).map(
            (v) => (v.name === varName ? { ...v, validValues: [...validValues] } : v),
          )
          updateCueMetadata({ variables: cueVars })
        }
      }
    },
    [
      editorDoc,
      selectedCueId,
      currentEffectDefinition?.variables,
      updateGroupMeta,
      updateCueMetadata,
      updateEffectMetadata,
    ],
  )

  const handleEventsChange = useCallback(
    (events: EventDefinition[]) => {
      if (!editorDoc || !selectedCueId) return
      updateCueMetadata({ events })
    },
    [editorDoc, selectedCueId, updateCueMetadata],
  )

  const handleEffectsChange = useCallback(
    (effects: EffectReference[]) => {
      if (!editorDoc || !selectedCueId) return
      updateCueMetadata({ effects })
    },
    [editorDoc, selectedCueId, updateCueMetadata],
  )

  const getVariableReferences = useCallback(
    (varName: string, _scope: 'cue' | 'cue-group'): string[] =>
      editorDoc ? collectVariableReferences(nodes, varName) : [],
    [editorDoc, nodes],
  )

  const getEventReferences = useCallback(
    (eventName: string): string[] =>
      editorDoc && selectedCueId && editorDoc.mode === 'cue'
        ? collectEventReferences(editorDoc.file as NodeCueFile, selectedCueId, eventName)
        : [],
    [editorDoc, selectedCueId],
  )

  const availableVariables = useMemo(() => {
    if (!editorDoc) return []

    // Effect mode: use effect's variables
    if (editorDoc.mode === 'effect') {
      const effectVars = (currentEffectDefinition?.variables ?? []).map((v) => ({
        name: v.name,
        type: v.type,
        scope: 'cue' as const, // Effect variables are cue-scoped
        validValues: v.validValues,
      }))
      return enrichAvailableVariables(effectVars, currentEffectDefinition?.nodes.logic, activeMode)
    }

    // Cue mode: combine group and cue variables
    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = selectedCueId ? cueFile.cues.find((c) => c.id === selectedCueId) : undefined
    const groupVars = (cueFile.group.variables ?? []).map((v) => ({
      name: v.name,
      type: v.type,
      scope: 'cue-group' as const,
      validValues: v.validValues,
    }))

    const cueVars = (currentCue?.variables ?? []).map((v) => ({
      name: v.name,
      type: v.type,
      scope: 'cue' as const,
      validValues: v.validValues,
    }))

    return enrichAvailableVariables([...groupVars, ...cueVars], currentCue?.nodes.logic, activeMode)
  }, [editorDoc, selectedCueId, currentEffectDefinition, activeMode])

  const availableEvents = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return []

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    return (currentCue?.events ?? []).map((e) => e.name)
  }, [editorDoc, selectedCueId])

  const availableEffects = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return []

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    return (currentCue?.effects ?? []).map((e) => ({
      id: e.effectId,
      name: e.name,
      definition: loadedEffectDefinitions.get(e.effectId),
    }))
  }, [editorDoc, selectedCueId, loadedEffectDefinitions])

  return {
    registryTab,
    setRegistryTab,
    handleVariablesChange,
    handleSyncVariableValidValues,
    handleEventsChange,
    handleEffectsChange,
    getVariableReferences,
    getEventReferences,
    availableVariables,
    availableEvents,
    availableEffects,
  }
}
