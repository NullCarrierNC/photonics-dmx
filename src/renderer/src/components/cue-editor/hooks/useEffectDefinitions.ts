import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorDocument } from '../lib/types'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type {
  EffectDefinition,
  EffectFile,
  NodeCueFile,
  NodeCueMode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { readEffectFile } from '../../../ipcApi'
import { createLogger } from '../../../../../shared/logger'

const log = createLogger('useEffectDefinitions')

type GroupedEffectFiles = {
  yarg: EffectFileSummary[]
  audio: EffectFileSummary[]
}

type LoadedEffectDefinitions = {
  requestKey: string
  definitions: Map<string, EffectDefinition>
}

function buildEffectRequestKey(
  editorDoc: EditorDocument,
  selectedCueId: string,
  mode: NodeCueMode,
  groupedEffectFiles: GroupedEffectFiles,
): string {
  const cueFile = editorDoc.file as NodeCueFile
  const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
  const effectRefs = currentCue?.effects ?? []
  const effectFileList = mode === 'audio' ? groupedEffectFiles.audio : groupedEffectFiles.yarg
  const refKey = effectRefs
    .map((ref) => {
      const fileEntry = effectFileList.find((f) => f.groupId === ref.effectFileId)
      return `${ref.effectFileId}:${ref.effectId}@${fileEntry?.path ?? 'missing'}`
    })
    .sort()
    .join('|')
  return `${editorDoc.path ?? 'unsaved'}:${selectedCueId}:${mode}:${refKey}`
}

/**
 * Definitions for the effects the selected cue references, keyed by effect id, read from disk as
 * the selection changes. A reference that no longer resolves is dropped rather than failing the
 * batch, so one stale reference cannot blank the panel.
 */
export function useEffectDefinitions(
  editorDoc: EditorDocument | null,
  selectedCueId: string | null,
  mode: NodeCueMode,
  groupedEffectFiles: GroupedEffectFiles,
): Map<string, EffectDefinition> {
  const requestKey = useMemo(() => {
    if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return null
    return buildEffectRequestKey(editorDoc, selectedCueId, mode, groupedEffectFiles)
  }, [editorDoc, selectedCueId, mode, groupedEffectFiles])

  const [loaded, setLoaded] = useState<LoadedEffectDefinitions | null>(null)

  // The request key already encodes the document, selection, mode and every resolved effect
  // path, so the read below depends on the key alone. Reading the inputs through a ref keeps
  // identity-only document churn from refiring the whole batch and cancelling it mid-flight.
  // This effect is declared first so it refreshes the ref before the loader runs on the same
  // commit.
  const inputsRef = useRef({ editorDoc, selectedCueId, mode, groupedEffectFiles })
  useEffect(() => {
    inputsRef.current = { editorDoc, selectedCueId, mode, groupedEffectFiles }
  })

  useEffect(() => {
    const {
      editorDoc: doc,
      selectedCueId: cueId,
      mode: cueMode,
      groupedEffectFiles: effectFiles,
    } = inputsRef.current
    if (!requestKey || !doc || doc.mode !== 'cue' || !cueId) return

    const cueFile = doc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === cueId)
    const effectRefs = currentCue?.effects ?? []

    let cancelled = false

    const loadEffects = async () => {
      // rb3 cues reference YARG effects, so rb3 reads the yarg effect bucket; only audio differs.
      const effectFileList = cueMode === 'audio' ? effectFiles.audio : effectFiles.yarg
      const promises = effectRefs.map(async (effectRef) => {
        try {
          const fileEntry = effectFileList.find((f) => f.groupId === effectRef.effectFileId)
          if (!fileEntry) return null
          const effectFileData = (await readEffectFile(fileEntry.path)) as EffectFile
          const effectDef = effectFileData.effects.find((e) => e.id === effectRef.effectId)
          return effectDef ? ([effectRef.effectId, effectDef] as const) : null
        } catch (error) {
          log.warn(`Failed to load effect ${effectRef.effectId}:`, error)
          return null
        }
      })

      const results = await Promise.all(promises)
      if (cancelled) return

      const newDefinitions = new Map<string, EffectDefinition>()
      for (const result of results) {
        if (result) newDefinitions.set(result[0], result[1])
      }
      setLoaded({ requestKey, definitions: newDefinitions })
    }

    loadEffects()
    return () => {
      cancelled = true
    }
  }, [requestKey])

  return useMemo(() => {
    if (!requestKey || loaded?.requestKey !== requestKey) return new Map()
    return loaded.definitions
  }, [loaded, requestKey])
}
