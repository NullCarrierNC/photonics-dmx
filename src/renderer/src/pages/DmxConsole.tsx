import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  DmxLight,
  DmxRig,
  LightingConfiguration,
  ConfigStrobeType,
} from '../../../photonics-dmx/types'
import { extraChannelDisplayLabel } from '../components/lightChannelDisplay'
import { getDmxRig, getDmxRigs, enableConsole, disableConsole, sendConsoleDmx } from '../ipcApi'
import { leaveConsole } from '../utils/leaveConsole'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  consoleRigIdAtom,
  consoleRigIdFor,
  lightingPrefsAtom,
  myDmxLightsAtom,
  previewRigIdAtom,
} from '../atoms'
import LightsDmxPreview from '../components/LightsDmxPreview'
import StrobeChannelPreviewNotice from '../components/StrobeChannelPreviewNotice'
import { DmxRigSelectField } from '../components/DmxRigSelectField'
import SacnToggle from '../components/SacnToggle'
import ArtNetToggle from '../components/ArtNetToggle'
import EnttecProToggle from '../components/EnttecProToggle'
import OpenDmxToggle from '../components/OpenDmxToggle'
import { useRigDmxValues } from '../hooks/useRigDmxValues'
import { useIpcPreviewSender } from '@renderer/hooks/useIpcPreviewSender'
import { DraftNumberField, type CommitOutcome } from '../components/controls/DraftField'
import { createLogger } from '../../../shared/logger'
const log = createLogger('DmxConsole')

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

import {
  buildConsoleFixedSeed,
  channelLabel,
  getEffectiveChannelEntries,
  getTemplateAlignedChannels,
  getTemplateAlignedExtraChannels,
  isLightModified,
  isMovingHeadFixture,
  isPanTiltChannelName,
  lightOnChannel,
} from './dmxConsoleChannels'

const DmxConsole: React.FC = () => {
  const [rigs, setRigs] = useState<DmxRig[]>([])
  const [prefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false
  const [consoleChoice, setConsoleChoice] = useAtom(consoleRigIdAtom)
  const previewRigId = useAtomValue(previewRigIdAtom)
  const selectedRigId = consoleRigIdFor(
    consoleChoice,
    previewRigId,
    rigs.map((r) => r.id),
  )
  // Templates drive which channels are displayed (so e.g. a newly-added Strobe Channel surfaces
  // without needing to re-save the rig); per-light DMX channel numbers still come from the rig.
  const [myLights] = useAtom(myDmxLightsAtom)
  const [selectedRig, setSelectedRig] = useState<DmxRig | null>(null)
  const [consoleEnabled, setConsoleEnabled] = useState(false)
  const [consoleBuffer, setConsoleBuffer] = useState<Record<number, number>>({})
  const [dmxValues, setDmxValues] = useState<Record<number, number>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [channelOverrides, setChannelOverrides] = useState<Record<string, Record<string, number>>>(
    {},
  )
  const consoleEnabledRef = useRef(false)
  // An enable that is still in flight owns console mode just as much as an open one does, so the
  // unmount cleanup waits for it rather than leaving the publisher in manual output.
  const enableInFlightRef = useRef<Promise<unknown> | null>(null)
  const [enabling, setEnabling] = useState(false)
  // Moves on when the page closes, so an enable answered after that seeds nothing.
  const enableTokenRef = useRef(0)
  // Mirror the currently-selected rig id into a ref so the long-lived DMX_VALUES listener can
  // pick the right per-rig buffer from `kind: 'rigs'` payloads without re-registering on every
  // rig switch.
  const selectedRigIdRef = useRef(selectedRigId)

  useEffect(() => {
    consoleEnabledRef.current = consoleEnabled
  }, [consoleEnabled])

  useEffect(() => {
    selectedRigIdRef.current = selectedRigId
  }, [selectedRigId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await getDmxRigs()
        if (cancelled) return
        setRigs(list)
        setLoadError(null)
      } catch (e) {
        log.error('Failed to load DMX rigs', e)
        if (!cancelled) {
          setLoadError('Failed to load rigs')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedRigId) {
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const rig = await getDmxRig(selectedRigId)
        if (!cancelled) {
          setSelectedRig(rig ?? null)
        }
      } catch (e) {
        log.error('Failed to load DMX rig', e)
        if (!cancelled) {
          setSelectedRig(null)
          setLoadError('Failed to load rig')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedRigId])

  useIpcPreviewSender()

  // `kind: 'manual'` is the console-takeover/blackout loopback (shown as-is); `kind: 'rigs'`
  // carries one buffer per rig, of which we show the currently-selected rig's own universe.
  // This uses the same rig selector as the live preview; a merged-universe view is not
  // meaningful with per-rig sender routing (rigs on separate universes can share channel numbers).
  useRigDmxValues(selectedRigIdRef, setDmxValues)

  useEffect(() => {
    return () => {
      enableTokenRef.current += 1
      const pending = enableInFlightRef.current
      if (pending) {
        // Either way it settles: an enable that rejects can still have left console mode open.
        pending.then(leaveConsole, leaveConsole)
        return
      }
      if (consoleEnabledRef.current) {
        leaveConsole()
      }
    }
  }, [])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.CONSOLE_LEFT, ({ reason }) => {
      if (!consoleEnabledRef.current) return
      setConsoleEnabled(false)
      setConsoleBuffer({})
      setChannelOverrides({})
      setActionError(reason)
    })
  }, [])

  const pushConsoleBuffer = useCallback((next: Record<number, number>) => {
    setConsoleBuffer(next)
    sendConsoleDmx(next)
  }, [])

  const handleToggleConsole = async () => {
    setActionError(null)
    if (!selectedRigId) {
      setActionError('Select a rig first')
      return
    }
    if (consoleEnabled) {
      try {
        const result = await disableConsole()
        if (result.success) {
          setConsoleEnabled(false)
          setConsoleBuffer({})
          setChannelOverrides({})
        } else {
          setActionError(result.error)
        }
      } catch (error) {
        log.error('Failed to leave DMX console mode', error)
        setActionError(messageFor(error))
      }
      return
    }
    // The rig config loads asynchronously; enabling before it arrives would seed an empty buffer and
    // the loader never re-seeds, leaving pinned fixed/mode channels dark for the whole session.
    if (!selectedRig || selectedRig.id !== selectedRigId) {
      setActionError('Rig is still loading — try again in a moment')
      return
    }
    if (enableInFlightRef.current) return
    enableTokenRef.current += 1
    const token = enableTokenRef.current
    const pending = enableConsole(selectedRigId)
    enableInFlightRef.current = pending
    setEnabling(true)
    const answer = await pending.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
    enableInFlightRef.current = null
    if (token !== enableTokenRef.current) return
    setEnabling(false)
    if ('error' in answer) {
      log.error('Failed to enter DMX console mode', answer.error)
      setActionError(messageFor(answer.error))
      return
    }
    const { result } = answer
    if (result.success) {
      // Seed pinned fixed/mode channels so fixtures that need them light up during the session.
      const seed = buildConsoleFixedSeed(selectedRig.config, myLights)
      setConsoleEnabled(true)
      setConsoleBuffer(seed)
      sendConsoleDmx(seed)
    } else {
      setActionError(result.error)
    }
  }

  const handleRigSelect = async (rigId: string) => {
    const nextId = rigId === '' ? null : rigId
    if (nextId === selectedRigId) {
      return
    }
    setActionError(null)
    if (consoleEnabled) {
      try {
        const result = await disableConsole()
        if (!result.success) {
          setActionError(result.error)
          return
        }
      } catch (error) {
        log.error('Failed to leave DMX console mode', error)
        setActionError(messageFor(error))
        return
      }
      setConsoleEnabled(false)
      setConsoleBuffer({})
    }
    setChannelOverrides({})
    setConsoleChoice(nextId)
  }

  const handleChannelValueChange = (channelNumber: number, value: number) => {
    const v = Math.max(0, Math.min(255, Math.round(value)))
    const next = { ...consoleBuffer, [channelNumber]: v }
    pushConsoleBuffer(next)
  }

  const handleChannelNumberCommit = (
    light: DmxLight,
    channelName: string,
    previousChannel: number,
    newChannel: number,
  ): CommitOutcome => {
    const clamped = Math.max(1, Math.min(512, Math.round(newChannel)))
    if (clamped === previousChannel) {
      return
    }
    setActionError(null)
    const baseChannels = getTemplateAlignedChannels(light, myLights)
    const baseline = baseChannels[channelName]
    const lightId = light.id
    const config = selectedRig?.config
    const moving = { lightId, channelName }
    // Moving onto a channel in use overwrites that light's value, so it is refused.
    const occupant = config && lightOnChannel(config, myLights, channelOverrides, clamped, moving)
    if (occupant) {
      setActionError(`Channel ${clamped} is already used by ${occupant.name}. Pick a free channel.`)
      return false
    }

    setChannelOverrides((prev) => {
      const nextForLight = { ...(prev[lightId] ?? {}) }
      if (clamped === baseline) {
        delete nextForLight[channelName]
      } else {
        nextForLight[channelName] = clamped
      }
      const nextGlobal = { ...prev }
      if (Object.keys(nextForLight).length === 0) {
        delete nextGlobal[lightId]
      } else {
        nextGlobal[lightId] = nextForLight
      }
      return nextGlobal
    })

    const next = { ...consoleBuffer }
    const moved = next[previousChannel] ?? 0
    // A light that shares the old channel keeps its value there.
    if (!config || !lightOnChannel(config, myLights, channelOverrides, previousChannel, moving)) {
      delete next[previousChannel]
    }
    next[clamped] = moved
    pushConsoleBuffer(next)
  }

  const renderFixtureCard = (light: DmxLight) => {
    const lightOverrides = light.id ? channelOverrides[light.id] : undefined
    const sorted = getEffectiveChannelEntries(light, myLights, lightOverrides)
    const baseChannels = getTemplateAlignedChannels(light, myLights)
    const alignedExtras = getTemplateAlignedExtraChannels(light, myLights)
    const extraLabelFixture = { ...light, extraChannels: alignedExtras }
    const modified = isLightModified(light, myLights, lightOverrides)
    const cardInactive = !consoleEnabled
    return (
      <div
        key={light.id}
        aria-disabled={cardInactive}
        className={`p-3 border rounded-lg mb-3 transition-[opacity,box-shadow,background-color,border-color] duration-200 ${
          modified ? 'border-l-4 border-l-amber-400 dark:border-l-amber-500 ' : ''
        }${
          cardInactive
            ? 'opacity-[0.68] border-dashed border-gray-300 dark:border-gray-600 bg-gray-100/90 dark:bg-gray-900/55 shadow-none'
            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 border-solid shadow'
        }`}>
        <h3 className="text-base font-semibold mb-2 text-gray-800 dark:text-gray-200 flex flex-wrap items-center gap-2">
          <span>
            {light.name} (#{light.position})
          </span>
          {modified && (
            <span className="text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
              Modified
            </span>
          )}
        </h3>
        <ul className="space-y-2">
          {sorted.map(([channelName, channelNumber], index) => {
            const channelInputModified = channelNumber !== baseChannels[channelName]
            const prevName = index > 0 ? sorted[index - 1][0] : null
            const showMhColourPanSeparator =
              isMovingHeadFixture(light.fixture) &&
              isPanTiltChannelName(channelName) &&
              (prevName == null || !isPanTiltChannelName(prevName))
            return (
              <li
                key={channelName}
                className={`flex flex-col gap-0.5${showMhColourPanSeparator ? ' pt-3 mt-1 border-t border-gray-200 dark:border-gray-600' : ''}`}>
                <div className="flex justify-between items-center gap-2">
                  <span className="capitalize text-gray-700 dark:text-gray-300 text-sm">
                    {channelLabel(channelName)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Value: {dmxValues[channelNumber] ?? 0}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 shrink-0">
                    DMX ch
                  </label>
                  <DraftNumberField
                    value={channelNumber}
                    min={1}
                    max={512}
                    disabled={!consoleEnabled}
                    onCommit={(channel) =>
                      handleChannelNumberCommit(light, channelName, channelNumber, channel)
                    }
                    className={`w-20 p-1 border rounded text-sm ${
                      channelInputModified
                        ? 'border-amber-400 dark:border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                    }`}
                  />
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={
                      consoleEnabled
                        ? consoleBuffer[channelNumber] ?? 0
                        : dmxValues[channelNumber] ?? 0
                    }
                    disabled={!consoleEnabled}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      handleChannelValueChange(channelNumber, v)
                    }}
                    className="flex-1 min-w-[120px] slider"
                  />
                </div>
              </li>
            )
          })}
          {/* Added channels — template-owned, so the DMX number is read-only here; the value slider
              still drives the channel so users can test it. Duplicate types collide by name, hence
              index keys and no remap input. */}
          {alignedExtras.map((extra, i) => {
            const label = extraChannelDisplayLabel(extraLabelFixture, i)
            return (
              <li key={`extra-${i}`} className="flex flex-col gap-0.5">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-700 dark:text-gray-300 text-sm">{label}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Value: {dmxValues[extra.channel] ?? 0}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 shrink-0">
                    DMX ch
                  </label>
                  <input
                    type="number"
                    value={extra.channel}
                    disabled
                    readOnly
                    className="w-20 p-1 border rounded text-sm border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  />
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={
                      consoleEnabled
                        ? consoleBuffer[extra.channel] ?? 0
                        : dmxValues[extra.channel] ?? 0
                    }
                    disabled={!consoleEnabled || extra.channel < 1}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      handleChannelValueChange(extra.channel, v)
                    }}
                    className="flex-1 min-w-[120px] slider"
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const renderLightsGroup = (lights: DmxLight[], title: string) => (
    <div className="mb-4 last:mb-0" key={title}>
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {lights.map((light) => renderFixtureCard(light))}
      </div>
    </div>
  )

  const selectedRigForUi =
    selectedRigId != null && selectedRig != null && selectedRig.id === selectedRigId
      ? selectedRig
      : null
  const rigConfig: LightingConfiguration | null = selectedRigForUi?.config ?? null

  const hasNoLights =
    rigConfig != null &&
    rigConfig.frontLights.length === 0 &&
    rigConfig.backLights.length === 0 &&
    rigConfig.strobeLights.length === 0

  return (
    <div className="p-6 w-full max-w-7xl mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">DMX Console</h1>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
        The DMX Console allows you to manually control the lights you have configured in Lights
        Layout. This lets you confirm your channel assignments are correct for each light.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        When the console is enabled, game support is disabled.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        <strong>Note:</strong> Changing DMX colour channel numbers here is temporary for this
        session only and is <strong>not saved</strong> to your rig or My Lights configuration.
      </p>

      <div className="mb-8 flex flex-wrap items-end gap-6 pt-4">
        {advancedModeEnabled && (
          <DmxRigSelectField
            className="mb-0"
            label="Rig"
            rigs={rigs}
            selectedRigId={selectedRigId}
            onChange={(id) => void handleRigSelect(id)}
            showInactiveSuffix
          />
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void handleToggleConsole()}
            disabled={enabling || (!consoleEnabled && (selectedRigForUi == null || hasNoLights))}
            className={`px-4 py-2 rounded-md font-medium text-white ${
              consoleEnabled
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400'
            }`}>
            {consoleEnabled ? 'Disable console' : 'Enable console'}
          </button>
          {consoleEnabled && (
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              Game/Audio cue processing is disabled while the console is active.
            </p>
          )}
        </div>
      </div>

      {(loadError || actionError) && (
        <div className="mb-4 p-3 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-sm">
          {loadError ?? actionError}
        </div>
      )}

      <div className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">DMX Output</h3>
          <p className="text-sm font-normal text-gray-600 dark:text-gray-400">
            (Enable more in Preferences)
          </p>
        </div>
        <div className="flex flex-row gap-8 items-start flex-wrap">
          <SacnToggle />
          <ArtNetToggle />
          <EnttecProToggle />
          <OpenDmxToggle />
        </div>
      </div>

      {hasNoLights && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                No lights are configured on this rig. Add lights in My Lights and assign them in
                Lights Layout.
              </h3>
            </div>
          </div>
        </div>
      )}

      {rigConfig && (
        <>
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1 text-gray-800 dark:text-gray-200">
              Light Preview
            </h2>
            <StrobeChannelPreviewNotice lightingConfig={rigConfig} className="mb-3" />
            {/* No scaling toggle: console output bypasses scaling (see setManualBuffer), so a
                scaled preview would not be what this page sends. */}
            <LightsDmxPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
          </div>

          <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-lg py-3">
            {rigConfig.frontLights.length > 0 &&
              renderLightsGroup(rigConfig.frontLights, 'Front Lights')}
            {rigConfig.backLights.length > 0 &&
              renderLightsGroup([...rigConfig.backLights].reverse(), 'Back Lights')}
            {rigConfig.strobeType === ConfigStrobeType.Dedicated &&
              rigConfig.strobeLights.length > 0 &&
              renderLightsGroup(rigConfig.strobeLights, 'Strobe Lights')}
          </div>
        </>
      )}

      {!rigConfig && selectedRigId && !loadError && (
        <p className="text-gray-600 dark:text-gray-400">Loading rig…</p>
      )}
    </div>
  )
}

export default DmxConsole
