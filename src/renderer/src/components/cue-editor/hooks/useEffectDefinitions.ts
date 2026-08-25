import { useEffect, useState } from 'react'
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
  const [loadedEffectDefinitions, setLoadedEffectDefinitions] = useState<
    Map<string, EffectDefinition>
  >(new Map())

  useEffect(() => {
    if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    const effectRefs = currentCue?.effects ?? []

    let cancelled = false

    const loadEffects = async () => {
      // rb3 cues reference YARG effects, so rb3 reads the yarg effect bucket; only audio differs.
      const effectFileList = mode === 'audio' ? groupedEffectFiles.audio : groupedEffectFiles.yarg
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
      setLoadedEffectDefinitions(newDefinitions)
    }

    loadEffects()
    return () => {
      cancelled = true
    }
  }, [editorDoc, selectedCueId, mode, groupedEffectFiles])

  return loadedEffectDefinitions
}
