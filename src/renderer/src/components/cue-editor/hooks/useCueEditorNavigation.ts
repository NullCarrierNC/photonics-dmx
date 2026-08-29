import { useCallback, useState } from 'react'
import type { NodeCueKind } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

type CuePlatform = 'yarg' | 'audio' | 'rb3'

interface UseCueEditorNavigationArgs {
  mode: CuePlatform
  cueKind: NodeCueKind
  isEffectMode: boolean
  /** Whether the in-memory document has unsaved edits. */
  isDirty: boolean
  /** Whether the JSON editor is open with unapplied edits. */
  jsonEditorDirty: boolean
  setCueKind(kind: NodeCueKind): void
  handleModeChange(modeKey: string): void
  closeJsonEditor(): void
  /** Reload the current file from disk, dropping in-memory edits. */
  revertCurrentFileToDisk(): Promise<void>
  setIsDirty(dirty: boolean): void
}

interface CueEditorNavigation {
  handleCuePlatformChange(platform: CuePlatform): void
  handleCueKindChange(kind: NodeCueKind): void
  handleEffectToggle(isEffect: boolean): void
  /**
   * Run `action` now when nothing is unsaved, otherwise park it as the pending navigation so the
   * editor can prompt before losing the edits.
   */
  guardJsonEditorNavigation(action: () => void): void
  pendingNavigation: (() => void) | null
  /** Discard the unsaved edits (reverting to disk) and run the parked navigation. */
  handleDiscardNavigation(): Promise<void>
  cancelPendingNavigation(): void
}

/**
 * Platform and kind navigation for the cue editor, plus the dirty-state guard that stands between
 * a navigation and unsaved work.
 *
 * The platform and kind selections map onto the file-mode keys `useCueFiles` switches on, which is
 * where the rb3 exceptions live: rb3 authors no effects of its own (the Effects toggle moves to the
 * YARG effect platform) and effect mode has no motion side.
 */
export function useCueEditorNavigation({
  mode,
  cueKind,
  isEffectMode,
  isDirty,
  jsonEditorDirty,
  setCueKind,
  handleModeChange,
  closeJsonEditor,
  revertCurrentFileToDisk,
  setIsDirty,
}: UseCueEditorNavigationArgs): CueEditorNavigation {
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)

  const handleCuePlatformChange = useCallback(
    (p: CuePlatform) => {
      // rb3 has no effects of its own, so it always lands on a cue.
      if (isEffectMode && p !== 'rb3') {
        handleModeChange(p === 'audio' ? 'audio-effect' : 'yarg-effect')
        return
      }
      if (cueKind === 'motion') {
        handleModeChange(
          p === 'yarg' ? 'yarg-motion-cue' : p === 'rb3' ? 'rb3-motion-cue' : 'audio-motion-cue',
        )
      } else {
        handleModeChange(p === 'yarg' ? 'yarg-cue' : p === 'rb3' ? 'rb3-cue' : 'audio-cue')
      }
    },
    [handleModeChange, isEffectMode, cueKind],
  )

  const handleCueKindChange = useCallback(
    (k: NodeCueKind) => {
      // The kind toggle is hidden in effect mode, which has no motion side.
      if (isEffectMode) return
      setCueKind(k)
      if (k === 'motion') {
        handleModeChange(
          mode === 'yarg'
            ? 'yarg-motion-cue'
            : mode === 'rb3'
              ? 'rb3-motion-cue'
              : 'audio-motion-cue',
        )
      } else {
        handleModeChange(mode === 'yarg' ? 'yarg-cue' : mode === 'rb3' ? 'rb3-cue' : 'audio-cue')
      }
    },
    [handleModeChange, isEffectMode, mode, setCueKind],
  )

  const handleEffectToggle = useCallback(
    (isEffect: boolean) => {
      // There is no rb3 effect mode: rb3 cues reference YARG effects, so from rb3 the Effects
      // toggle switches to the YARG effect platform (where those effects are authored).
      if (isEffect) {
        setCueKind('lighting')
        const effectKey = mode === 'audio' ? 'audio-effect' : 'yarg-effect'
        handleModeChange(effectKey)
      } else {
        const cueKey = mode === 'audio' ? 'audio-cue' : 'yarg-cue'
        handleModeChange(cueKey)
      }
    },
    [handleModeChange, mode, setCueKind],
  )

  const guardJsonEditorNavigation = useCallback(
    (action: () => void) => {
      if (jsonEditorDirty || isDirty) {
        setPendingNavigation(() => action)
      } else {
        closeJsonEditor()
        action()
      }
    },
    [jsonEditorDirty, isDirty, closeJsonEditor],
  )

  const handleDiscardNavigation = useCallback(async () => {
    if (!pendingNavigation) return
    // Edits live in the in-memory editorDoc (Add Cue / JSON Apply / metadata), so truly
    // discarding them means reverting to the on-disk copy before performing the navigation.
    // The revert also restores kind, selection and flow, since the discarded edit may have
    // been the cue that was open.
    await revertCurrentFileToDisk()
    pendingNavigation()
    setPendingNavigation(null)
    closeJsonEditor()
    setIsDirty(false)
  }, [pendingNavigation, revertCurrentFileToDisk, closeJsonEditor, setIsDirty])

  const cancelPendingNavigation = useCallback(() => setPendingNavigation(null), [])

  return {
    handleCuePlatformChange,
    handleCueKindChange,
    handleEffectToggle,
    guardJsonEditorNavigation,
    pendingNavigation,
    handleDiscardNavigation,
    cancelPendingNavigation,
  }
}
