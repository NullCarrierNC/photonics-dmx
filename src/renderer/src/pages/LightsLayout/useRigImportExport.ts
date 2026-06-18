import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { DmxFixture, DmxRig, LightingConfiguration } from '../../../../photonics-dmx/types'
import {
  reconcileImportedTemplates,
  prepareImportedRig,
  duplicateRig,
  countOrphanLights,
  suggestUniqueName,
} from '../../../../photonics-dmx/helpers/rigImportExport'
import {
  exportRig,
  pickRigImportFile,
  saveDmxRig,
  saveMyLights,
  getDmxRigs,
  deleteDmxRig,
} from '../../ipcApi'
import type { ImportRigSummary } from './components/ImportRigModal'
import type { ToastType } from '../../hooks/useToast'
import type { ConfirmOptions } from '../../hooks/useConfirm'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('useRigImportExport')

type ShowToast = (message: string, type?: ToastType, duration?: number) => void

/**
 * Strip a rig's `outputs` so it falls back to "publish to every enabled wire sender". Applied to the
 * lone survivor when a delete collapses the rig set to one — mirrors ActiveRigsSettings, where the
 * routing UI hides at a single rig and a stale routing choice would otherwise be stuck on invisibly.
 */
function clearRigOutputs(rig: DmxRig): DmxRig {
  if (rig.outputs === undefined) {
    return rig
  }
  const { outputs: _omit, ...rest } = rig
  return rest
}

/** A parsed, validated import awaiting the user's confirmation in the modal. */
export type PendingRigImport = {
  sourceBasename: string
  /** The validated rig from the file (not yet re-linked / renamed). */
  rig: DmxRig
  /** New templates to persist to My Lights on commit. */
  templatesToAdd: DmxFixture[]
  /** Imported template id → final template id, for re-linking the rig's `fixtureId`s. */
  fixtureIdMap: Record<string, string>
  summary: ImportRigSummary
  defaultName: string
}

interface UseRigImportExportParams {
  rigs: DmxRig[]
  setRigs: Dispatch<SetStateAction<DmxRig[]>>
  activeRigId: string | null
  setActiveRigId: (id: string) => void
  setRigName: (name: string) => void
  setActiveLightsConfig: (config: LightingConfiguration) => void
  myFixtureLibrary: DmxFixture[]
  setMyFixtureLibrary: (lights: DmxFixture[]) => void
  /** Confirm-discard guard; return false to abort when there are unsaved editor edits. */
  onBeforeDiscardingUnsaved: () => Promise<boolean>
  /** Whether the editor has unsaved edits (export uses the last saved rig, so we note this). */
  isDirty: boolean
  showToast: ShowToast
  /** Programmatic confirm dialog, used for the destructive delete. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const CANCEL_EXPORT = 'User cancelled export.'
const CANCEL_IMPORT = 'User cancelled import.'

export function useRigImportExport({
  rigs,
  setRigs,
  activeRigId,
  setActiveRigId,
  setRigName,
  setActiveLightsConfig,
  myFixtureLibrary,
  setMyFixtureLibrary,
  onBeforeDiscardingUnsaved,
  isDirty,
  showToast,
  confirm,
}: UseRigImportExportParams) {
  const [pendingImport, setPendingImport] = useState<PendingRigImport | null>(null)

  // Adopt the backend-canonical rig shape after a save (migration + template sync materialize
  // derived fields), then select it — mirrors LightsLayout.handleSaveChanges so the new rig is
  // selected and the unsaved indicator stays clean. Falls back to the local rig if the re-read fails.
  const selectSavedRig = useCallback(
    async (newRig: DmxRig) => {
      try {
        const freshRigs = await getDmxRigs()
        const fresh = freshRigs.find((r) => r.id === newRig.id)
        if (fresh) {
          setRigs(freshRigs)
          setActiveRigId(fresh.id)
          setRigName(fresh.name)
          setActiveLightsConfig(fresh.config)
          return
        }
      } catch (err) {
        log.error('Failed to refresh rigs after save; using local rig', err)
      }
      setRigs((prev) => (prev.some((r) => r.id === newRig.id) ? prev : [...prev, newRig]))
      setActiveRigId(newRig.id)
      setRigName(newRig.name)
      setActiveLightsConfig(newRig.config)
    },
    [setRigs, setActiveRigId, setRigName, setActiveLightsConfig],
  )

  const handleExport = useCallback(async () => {
    if (!activeRigId) return
    try {
      const result = await exportRig(activeRigId)
      if (!result.success) {
        if (result.error !== CANCEL_EXPORT) {
          showToast(result.error, 'error', 5000)
        }
        return
      }
      showToast(
        isDirty ? 'Exported the last saved version (unsaved edits not included).' : 'Rig exported.',
        'success',
        3500,
      )
    } catch (error) {
      log.error('Failed to export layout:', error)
      showToast('Failed to export layout.', 'error', 5000)
    }
  }, [activeRigId, isDirty, showToast])

  const handleImport = useCallback(async () => {
    if (!(await onBeforeDiscardingUnsaved())) return
    try {
      const result = await pickRigImportFile()
      if (!result.success) {
        if (result.error !== CANCEL_IMPORT) {
          showToast(result.error, 'error', 5000)
        }
        return
      }

      // Preview the de-dup against the current My Lights so the modal can summarize it.
      const { templatesToAdd, fixtureIdMap, reusedCount } = reconcileImportedTemplates(
        result.templates,
        myFixtureLibrary,
      )
      const orphanCount = countOrphanLights(result.rig, fixtureIdMap)
      const takenNames = new Set(rigs.map((r) => r.name.trim().toLowerCase()))

      setPendingImport({
        sourceBasename: result.sourceBasename,
        rig: result.rig,
        templatesToAdd,
        fixtureIdMap,
        summary: {
          templatesToAddCount: templatesToAdd.length,
          templatesReusedCount: reusedCount,
          orphanCount,
        },
        defaultName: suggestUniqueName(result.rig.name, takenNames),
      })
    } catch (error) {
      log.error('Failed to read rig import file:', error)
      showToast('Failed to read rig file.', 'error', 5000)
    }
  }, [onBeforeDiscardingUnsaved, myFixtureLibrary, rigs, showToast])

  const clearPendingImport = useCallback(() => setPendingImport(null), [])

  const commitPendingImport = useCallback(
    async (rigName: string) => {
      if (!pendingImport) return
      const pending = pendingImport
      try {
        // Persist new templates first so the rig's fixtureIds resolve when the rig is saved.
        if (pending.templatesToAdd.length > 0) {
          const nextLibrary = [...myFixtureLibrary, ...pending.templatesToAdd]
          const res = await saveMyLights(nextLibrary)
          if (!res.success) {
            showToast(res.error || 'Failed to import light templates.', 'error', 5000)
            return
          }
          setMyFixtureLibrary(nextLibrary)
        }

        const newRig = prepareImportedRig(
          { ...pending.rig, name: rigName },
          pending.fixtureIdMap,
          rigs.map((r) => r.name),
        )
        const rigRes = await saveDmxRig(newRig)
        if (!rigRes.success) {
          showToast(rigRes.error || 'Failed to import layout.', 'error', 5000)
          return
        }

        await selectSavedRig(newRig)
        setPendingImport(null)
        showToast(`Layout imported: ${newRig.name}`, 'success', 4000)
      } catch (error) {
        log.error('Failed to import layout:', error)
        showToast('Failed to import layout.', 'error', 5000)
      }
    },
    [pendingImport, myFixtureLibrary, rigs, setMyFixtureLibrary, selectSavedRig, showToast],
  )

  const handleDuplicate = useCallback(async () => {
    if (!(await onBeforeDiscardingUnsaved())) return
    const source = rigs.find((r) => r.id === activeRigId)
    if (!source) {
      showToast('No rig selected to duplicate.', 'error', 4000)
      return
    }
    try {
      const newRig = duplicateRig(
        source,
        rigs.map((r) => r.name),
      )
      const res = await saveDmxRig(newRig)
      if (!res.success) {
        showToast(res.error || 'Failed to duplicate layout.', 'error', 5000)
        return
      }
      await selectSavedRig(newRig)
      showToast(`Rig duplicated: ${newRig.name}`, 'success', 4000)
    } catch (error) {
      log.error('Failed to duplicate rig:', error)
      showToast('Failed to duplicate layout.', 'error', 5000)
    }
  }, [onBeforeDiscardingUnsaved, rigs, activeRigId, selectSavedRig, showToast])

  const handleDelete = useCallback(async () => {
    if (!activeRigId) return
    if (rigs.length <= 1) {
      showToast('You need at least one layout.', 'info', 4000)
      return
    }
    const target = rigs.find((r) => r.id === activeRigId)
    if (!target) return

    const confirmed = await confirm({
      title: 'Delete rig',
      message: `Delete "${target.name}"? This permanently removes the rig. Your My Lights templates are not affected.`,
      confirmLabel: 'Delete rig',
      danger: true,
    })
    if (!confirmed) return

    try {
      const res = await deleteDmxRig(activeRigId)
      if (!res.success) {
        showToast(res.error || 'Failed to delete rig.', 'error', 5000)
        return
      }

      const remaining = rigs.filter((r) => r.id !== activeRigId)
      // Collapsing to a single rig hides the routing UI elsewhere; strip the survivor's outputs.
      if (remaining.length === 1) {
        const cleared = clearRigOutputs(remaining[0])
        if (cleared !== remaining[0]) {
          await saveDmxRig(cleared)
        }
      }

      // Select a surviving rig and adopt its canonical shape (re-read so template sync is applied).
      const nextId = remaining[0].id
      try {
        const freshRigs = await getDmxRigs()
        setRigs(freshRigs)
        const next = freshRigs.find((r) => r.id === nextId) ?? freshRigs[0]
        if (next) {
          setActiveRigId(next.id)
          setRigName(next.name)
          setActiveLightsConfig(next.config)
        }
      } catch (err) {
        log.error('Failed to refresh rigs after delete; using local list', err)
        setRigs(remaining)
        setActiveRigId(remaining[0].id)
        setRigName(remaining[0].name)
        setActiveLightsConfig(remaining[0].config)
      }

      showToast(`Rig deleted: ${target.name}`, 'success', 4000)
    } catch (error) {
      log.error('Failed to delete rig:', error)
      showToast('Failed to delete rig.', 'error', 5000)
    }
  }, [
    activeRigId,
    rigs,
    confirm,
    showToast,
    setRigs,
    setActiveRigId,
    setRigName,
    setActiveLightsConfig,
  ])

  return {
    pendingImport,
    handleExport,
    handleImport,
    handleDuplicate,
    handleDelete,
    commitPendingImport,
    clearPendingImport,
  }
}
