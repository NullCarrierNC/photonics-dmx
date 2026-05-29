import React, { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { dmxRigsAtom, lightingPrefsAtom } from '../atoms'
import { DmxRig, WIRE_SENDER_IDS, WireSenderId } from '../../../photonics-dmx/types'
import { getDmxRigs, saveDmxRig, deleteDmxRig, savePrefs } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
const log = createLogger('ActiveRigsSettings')

/** Human label for each wire sender, shown next to per-rig output checkboxes. */
const WIRE_SENDER_LABELS: Record<WireSenderId, string> = {
  sacn: 'sACN',
  artnet: 'Art-Net',
  enttecpro: 'Enttec Pro',
  opendmx: 'OpenDMX',
}

/**
 * A rig's wire output is "all" when `outputs` is unset (legacy default — publishes to every
 * enabled wire sender). Once the user touches any checkbox we materialise an explicit array; if
 * they tick all of them back on we collapse to undefined so the rig follows future changes to
 * the enabled-sender set automatically.
 */
function rigPublishesTo(rig: DmxRig, senderId: WireSenderId): boolean {
  return rig.outputs === undefined || rig.outputs.includes(senderId)
}

function toggleRigOutput(
  rig: DmxRig,
  senderId: WireSenderId,
  enabled: boolean,
): WireSenderId[] | undefined {
  const currentChecked = new Set<WireSenderId>(
    rig.outputs === undefined ? WIRE_SENDER_IDS : rig.outputs,
  )
  if (enabled) {
    currentChecked.add(senderId)
  } else {
    currentChecked.delete(senderId)
  }
  // Collapse "all four" back to undefined (== legacy "publish everywhere") so the rig keeps
  // following the enabled-sender set if it grows.
  if (currentChecked.size === WIRE_SENDER_IDS.length) {
    return undefined
  }
  // Preserve canonical WIRE_SENDER_IDS order in the stored array.
  return WIRE_SENDER_IDS.filter((id) => currentChecked.has(id))
}

/**
 * Returns a copy of `rig` with the `outputs` field stripped. Used wherever the routing UI is
 * about to be hidden (rig count collapses to 1, or the user opts out of multi-rig support) so
 * the rig falls back to the legacy "publish to every enabled wire sender" behaviour rather than
 * being silently stuck on a routing decision the user can no longer see or edit.
 */
function clearRigOutputs(rig: DmxRig): DmxRig {
  if (rig.outputs === undefined) {
    return rig
  }
  const { outputs: _omit, ...rest } = rig
  return rest
}

/**
 * Applies a mirror-flag change to a rig: setting `true` stamps the field, setting `false`
 * (the no-op default) strips it from the stored shape so on-disk configs stay minimal. Mirrors
 * the {@link clearRigOutputs} strip pattern used for the legacy "publish to all" default.
 */
function setRigMirrorFlag(rig: DmxRig, axis: 'horiz' | 'vert', enabled: boolean): DmxRig {
  const field = axis === 'horiz' ? 'mirrorHoriz' : 'mirrorVert'
  if (enabled) {
    return { ...rig, [field]: true }
  }
  if (rig[field] === undefined) {
    return rig
  }
  const { [field]: _omit, ...rest } = rig
  return rest
}

const ActiveRigsSettings: React.FC = () => {
  const [rigs, setRigs] = useAtom(dmxRigsAtom)
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const allowMultipleActiveRigs = prefs.allowMultipleActiveRigs ?? false
  // Routing is per-rig and only meaningful when at least two rigs exist AND the user has opted
  // into multi-rig support. Otherwise we hide the column and the engine falls back to the
  // legacy "publish to every enabled wire sender" default via `outputs === undefined`.
  const showRouting = allowMultipleActiveRigs && rigs.length > 1

  // Load rigs on mount
  useEffect(() => {
    const loadRigs = async () => {
      try {
        const loadedRigs = await getDmxRigs()
        setRigs(loadedRigs || [])
      } catch (error) {
        log.error('Failed to load DMX rigs:', error)
      }
    }

    loadRigs()
  }, [setRigs])

  const handleActiveToggle = async (rigId: string, newActive: boolean) => {
    try {
      const rig = rigs.find((r) => r.id === rigId)
      if (!rig) return

      // If multiple active rigs are not allowed and we're activating a rig,
      // deactivate all other rigs first
      if (!allowMultipleActiveRigs && newActive) {
        // Deactivate all other rigs
        const otherRigs = rigs.filter((r) => r.id !== rigId && r.active)
        for (const otherRig of otherRigs) {
          const deactivatedRig: DmxRig = {
            ...otherRig,
            active: false,
          }
          await saveDmxRig(deactivatedRig)
        }
      }

      // Update the selected rig
      const updatedRig: DmxRig = {
        ...rig,
        active: newActive,
      }
      await saveDmxRig(updatedRig)

      // Update local state
      setRigs((prev) =>
        prev.map((r) => {
          if (r.id === rigId) {
            return updatedRig
          }
          // If multiple active rigs not allowed and we activated a rig, deactivate others
          if (!allowMultipleActiveRigs && newActive && r.active) {
            return { ...r, active: false }
          }
          return r
        }),
      )
    } catch (error) {
      log.error('Failed to update rig active state:', error)
    }
  }

  const handleAllowMultipleActiveRigsChange = async (enabled: boolean) => {
    try {
      await savePrefs({ allowMultipleActiveRigs: enabled })
      setPrefs((prev) => ({
        ...prev,
        allowMultipleActiveRigs: enabled,
      }))

      // If disabling multiple active rigs, two things must happen:
      //   1. At most one rig stays active (existing behaviour).
      //   2. The routing UI is about to be hidden, so strip `outputs` on every rig that has it
      //      — otherwise rigs are silently stuck on a routing choice the user can no longer see.
      if (!enabled) {
        const activeRigs = rigs.filter((r) => r.active)
        const deactivatedIds = new Set<string>()
        if (activeRigs.length > 1) {
          const otherActiveRigs = activeRigs.slice(1)
          for (const otherRig of otherActiveRigs) {
            await saveDmxRig({ ...otherRig, active: false })
            deactivatedIds.add(otherRig.id)
          }
        }

        const clearedIds = new Set<string>()
        for (const rig of rigs) {
          if (rig.outputs === undefined) continue
          const next = clearRigOutputs(rig)
          // Persist with the deactivated-active flag too if this rig is one we just deactivated.
          const persisted = deactivatedIds.has(rig.id) ? { ...next, active: false } : next
          await saveDmxRig(persisted)
          clearedIds.add(rig.id)
        }

        setRigs((prev) =>
          prev.map((r) => {
            const wasDeactivated = deactivatedIds.has(r.id)
            const wasCleared = clearedIds.has(r.id)
            if (!wasDeactivated && !wasCleared) return r
            const next = wasCleared ? clearRigOutputs(r) : r
            return wasDeactivated ? { ...next, active: false } : next
          }),
        )
      }
    } catch (error) {
      log.error('Failed to update allow multiple active rigs preference:', error)
    }
  }

  const handleOutputToggle = async (rigId: string, senderId: WireSenderId, checked: boolean) => {
    try {
      const rig = rigs.find((r) => r.id === rigId)
      if (!rig) return
      const nextOutputs = toggleRigOutput(rig, senderId, checked)
      const updatedRig: DmxRig =
        nextOutputs === undefined ? clearRigOutputs(rig) : { ...rig, outputs: nextOutputs }
      await saveDmxRig(updatedRig)
      setRigs((prev) => prev.map((r) => (r.id === rigId ? updatedRig : r)))
    } catch (error) {
      log.error('Failed to update rig outputs:', error)
    }
  }

  const handleMirrorToggle = async (rigId: string, axis: 'horiz' | 'vert', enabled: boolean) => {
    try {
      const rig = rigs.find((r) => r.id === rigId)
      if (!rig) return
      const updatedRig = setRigMirrorFlag(rig, axis, enabled)
      if (updatedRig === rig) return
      await saveDmxRig(updatedRig)
      setRigs((prev) => prev.map((r) => (r.id === rigId ? updatedRig : r)))
    } catch (error) {
      log.error('Failed to update rig mirror:', error)
    }
  }

  const handleDelete = async (rigId: string) => {
    try {
      await deleteDmxRig(rigId)
      const remaining = rigs.filter((r) => r.id !== rigId)

      // If deletion collapses the rig set to a single rig, the routing UI is about to be
      // hidden — strip the survivor's `outputs` so it can't be silently stuck on a routing
      // choice the user can no longer see or edit.
      let survivorCleared: DmxRig | null = null
      if (remaining.length === 1) {
        const cleared = clearRigOutputs(remaining[0]!)
        if (cleared !== remaining[0]) {
          await saveDmxRig(cleared)
          survivorCleared = cleared
        }
      }

      setRigs((prev) =>
        prev
          .filter((r) => r.id !== rigId)
          .map((r) => (survivorCleared && r.id === survivorCleared.id ? survivorCleared : r)),
      )
      setShowDeleteConfirm(null)
    } catch (error) {
      log.error('Failed to delete rig:', error)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Active Rigs
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Manage your DMX rigs. Only active rigs will output DMX data.
        <br />
        <strong>CAUTION: multiple rig support is experimental and may not work as intended.</strong>
      </p>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            id="allowMultipleActiveRigs"
            checked={allowMultipleActiveRigs}
            onChange={(e) => handleAllowMultipleActiveRigsChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label
            htmlFor="allowMultipleActiveRigs"
            className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Allow Multiple Active Rigs
          </label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
          When multiple rigs are active DMX data will be published to all active rigs
          simultaneously.
          {showRouting && (
            <>
              <br />
              Use the <b>Outputs</b> checkboxes on each rig below to choose which wire senders carry
              it (e.g. Rig A → sACN, Rig B → OpenDMX). Outputs targeting senders that are not
              currently enabled in DMX Out are stored but produce no traffic until the sender is
              enabled. The in-app preview always sees every active rig regardless of routing.
            </>
          )}
          {!allowMultipleActiveRigs && rigs.length > 1 && (
            <>
              <br />
              Enable this to route specific rigs to specific DMX outputs.
            </>
          )}
        </p>
      </div>

      {rigs.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No rigs configured. Create a rig in Lights Layout.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-600 rounded-lg">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Rig Name
                </th>
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active
                </th>
                <th
                  className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                  title="Mirror this rig at runtime: Horiz reverses left/right within each row; Vert swaps front and back. Combine both for a 180° rotation.">
                  Mirror
                </th>
                {showRouting && (
                  <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Outputs
                  </th>
                )}
                <th className="text-left p-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rigs.map((rig) => (
                <tr
                  key={rig.id}
                  className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="p-2 text-gray-800 dark:text-gray-200">{rig.name}</td>
                  <td className="p-2">
                    {allowMultipleActiveRigs ? (
                      <input
                        type="checkbox"
                        checked={rig.active}
                        onChange={(e) => handleActiveToggle(rig.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                    ) : (
                      <input
                        type="radio"
                        name="activeRig"
                        checked={rig.active}
                        onChange={() => handleActiveToggle(rig.id, true)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor={`rig-${rig.id}-mirror-horiz`}
                        className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300"
                        title="Mirror left/right: reverse light order within each row.">
                        <input
                          type="checkbox"
                          id={`rig-${rig.id}-mirror-horiz`}
                          checked={rig.mirrorHoriz === true}
                          onChange={(e) => handleMirrorToggle(rig.id, 'horiz', e.target.checked)}
                          className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        Horiz
                      </label>
                      <label
                        htmlFor={`rig-${rig.id}-mirror-vert`}
                        className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300"
                        title="Mirror front/back: swap the front and back rows.">
                        <input
                          type="checkbox"
                          id={`rig-${rig.id}-mirror-vert`}
                          checked={rig.mirrorVert === true}
                          onChange={(e) => handleMirrorToggle(rig.id, 'vert', e.target.checked)}
                          className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        Vert
                      </label>
                    </div>
                  </td>
                  {showRouting && (
                    <td className="p-2">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {WIRE_SENDER_IDS.map((senderId) => {
                          const inputId = `rig-${rig.id}-output-${senderId}`
                          const checked = rigPublishesTo(rig, senderId)
                          return (
                            <label
                              key={senderId}
                              htmlFor={inputId}
                              className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                id={inputId}
                                checked={checked}
                                onChange={(e) =>
                                  handleOutputToggle(rig.id, senderId, e.target.checked)
                                }
                                className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                              {WIRE_SENDER_LABELS[senderId]}
                            </label>
                          )
                        })}
                      </div>
                      {rig.outputs === undefined && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                          Publishing to all enabled wire senders.
                        </p>
                      )}
                    </td>
                  )}
                  <td className="p-2">
                    {showDeleteConfirm === rig.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Confirm?</span>
                        <button
                          onClick={() => handleDelete(rig.id)}
                          className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs">
                          Yes
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs">
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(rig.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ActiveRigsSettings
