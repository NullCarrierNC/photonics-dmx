import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getDefaultStore, useAtom } from 'jotai'
import {
  DmxFixture,
  DmxLight,
  DmxRig,
  LightingConfiguration,
  ConfigStrobeType,
  FixtureTypes,
  IpcSenderConfig,
} from '../../../photonics-dmx/types'
import {
  getDmxRig,
  getDmxRigs,
  enableConsole,
  disableConsole,
  sendConsoleDmx,
  enableSender,
} from '../ipcApi'
import {
  lightingPrefsAtom,
  myDmxLightsAtom,
  previewRigIdAtom,
  resolveLastUsedRigId,
} from '../atoms'
import LightsDmxPreview from '../components/LightsDmxPreview'
import StrobeChannelPreviewNotice from '../components/StrobeChannelPreviewNotice'
import { DmxRigSelectField } from '../components/DmxRigSelectField'
import SacnToggle from '../components/SacnToggle'
import ArtNetToggle from '../components/ArtNetToggle'
import EnttecProToggle from '../components/EnttecProToggle'
import OpenDmxToggle from '../components/OpenDmxToggle'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { createLogger } from '../../../shared/logger'
const log = createLogger('DmxConsole')

function channelSortKey(name: string): number {
  const order = ['masterDimmer', 'red', 'green', 'blue', 'white', 'strobeChannel', 'pan', 'tilt']
  if (name === 'md') {
    return 0
  }
  const i = order.indexOf(name)
  return i === -1 ? order.length : i
}

function channelsAsRecord(channels: DmxFixture['channels']): Record<string, number> {
  return channels as unknown as Record<string, number>
}

/**
 * Resolves the channel set to display for a rig light. The shape (which channels exist) comes from
 * the live fixture template — so e.g. enabling "Strobe Channel?" on a template in MyLights surfaces
 * the new channel here immediately, without needing to re-pick the fixture in LightsLayout. The
 * channel NUMBERS are computed by applying the same offset-from-master-dimmer model used elsewhere
 * (e.g. {@link createDmxLightInstance}, {@link LightChannelsConfig}).
 *
 * Falls back to the light's persisted channels when no template is found (legacy / orphaned light).
 */
function getTemplateAlignedChannels(
  light: DmxLight,
  templates: DmxFixture[],
): Record<string, number> {
  const template = templates.find((t) => t.id === light.fixtureId)
  const persisted = channelsAsRecord(light.channels)
  if (!template) {
    return persisted
  }
  const templateChannels = channelsAsRecord(template.channels)
  const templateMaster = templateChannels.masterDimmer ?? 0
  const lightMaster = persisted.masterDimmer ?? templateMaster
  const out: Record<string, number> = {}
  for (const [name, templateValue] of Object.entries(templateChannels)) {
    if (name === 'masterDimmer') {
      out[name] = lightMaster
    } else {
      // Prefer the persisted offset if present (user may have nudged a single channel); otherwise
      // derive from the template's offset relative to its master dimmer.
      const persistedValue = persisted[name]
      if (typeof persistedValue === 'number') {
        out[name] = persistedValue
      } else {
        const offset = templateValue - templateMaster
        out[name] = lightMaster + offset
      }
    }
  }
  return out
}

function getEffectiveChannelEntries(
  light: DmxLight,
  templates: DmxFixture[],
  overrides?: Record<string, number>,
): Array<[string, number]> {
  const channels = getTemplateAlignedChannels(light, templates)
  const effective = overrides ? { ...channels, ...overrides } : channels
  return (Object.entries(effective) as Array<[string, number]>).sort(
    (a, b) => channelSortKey(a[0]) - channelSortKey(b[0]),
  )
}

function isLightModified(
  light: DmxLight,
  templates: DmxFixture[],
  overrides?: Record<string, number>,
): boolean {
  if (!overrides) {
    return false
  }
  const baseline = getTemplateAlignedChannels(light, templates)
  return Object.entries(overrides).some(([name, num]) => baseline[name] !== num)
}

function channelLabel(name: string): string {
  if (name === 'md' || name === 'masterDimmer') {
    return 'MasterDimmer'
  }
  if (name === 'strobeChannel') {
    return 'Strobe Speed'
  }
  return name
}

function isPanTiltChannelName(name: string): boolean {
  return name === 'pan' || name === 'tilt'
}

function isMovingHeadFixture(fixture: FixtureTypes): boolean {
  return fixture === FixtureTypes.RGBMH || fixture === FixtureTypes.RGBWMH
}

const DmxConsole: React.FC = () => {
  const [rigs, setRigs] = useState<DmxRig[]>([])
  const [prefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false
  const [selectedRigId, setSelectedRigId] = useAtom(previewRigIdAtom)
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

  useEffect(() => {
    consoleEnabledRef.current = consoleEnabled
  }, [consoleEnabled])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await getDmxRigs()
        if (cancelled) return
        setRigs(list)
        const orderedIds = list.map((r) => r.id)
        const currentId = getDefaultStore().get(previewRigIdAtom)
        const resolved = resolveLastUsedRigId(currentId, orderedIds)
        if (resolved !== currentId) {
          setSelectedRigId(resolved)
        }
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
  }, [setSelectedRigId])

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

  useEffect(() => {
    let cancelled = false
    void enableSender({ sender: 'ipc' } as IpcSenderConfig).catch((err) => {
      if (!cancelled) {
        log.error('Failed to enable IPC preview sender', err)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.DMX_VALUES, (data) => {
      setDmxValues(
        typeof data.universeBuffer === 'object' && data.universeBuffer !== null
          ? data.universeBuffer
          : {},
      )
    })
  }, [])

  useEffect(() => {
    return () => {
      if (consoleEnabledRef.current) {
        void disableConsole()
      }
    }
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
      const result = await disableConsole()
      if (result.success) {
        setConsoleEnabled(false)
        setConsoleBuffer({})
        setChannelOverrides({})
      } else {
        setActionError(result.error)
      }
      return
    }
    const result = await enableConsole(selectedRigId)
    if (result.success) {
      setConsoleEnabled(true)
      setConsoleBuffer({})
      sendConsoleDmx({})
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
      await disableConsole()
      setConsoleEnabled(false)
      setConsoleBuffer({})
    }
    setChannelOverrides({})
    setSelectedRigId(nextId)
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
  ) => {
    if (light.id === null) {
      return
    }
    const clamped = Math.max(1, Math.min(512, Math.round(newChannel)))
    if (clamped === previousChannel) {
      return
    }
    setActionError(null)
    const baseChannels = getTemplateAlignedChannels(light, myLights)
    const baseline = baseChannels[channelName]
    const lightId = light.id

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

    setConsoleBuffer((prev) => {
      const next = { ...prev }
      const moved = next[previousChannel] ?? 0
      delete next[previousChannel]
      next[clamped] = moved
      sendConsoleDmx(next)
      return next
    })
  }

  const renderFixtureCard = (light: DmxLight) => {
    const lightOverrides = light.id ? channelOverrides[light.id] : undefined
    const sorted = getEffectiveChannelEntries(light, myLights, lightOverrides)
    const baseChannels = getTemplateAlignedChannels(light, myLights)
    const modified = isLightModified(light, myLights, lightOverrides)
    const cardInactive = !consoleEnabled
    return (
      <div
        key={light.id ?? `light-${light.position}`}
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
                  <input
                    type="number"
                    min={1}
                    max={512}
                    defaultValue={channelNumber}
                    key={`${light.id}-${channelName}-${channelNumber}`}
                    disabled={!consoleEnabled || light.id === null}
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value, 10)
                      if (!Number.isFinite(parsed)) {
                        e.target.value = String(channelNumber)
                        return
                      }
                      handleChannelNumberCommit(light, channelName, channelNumber, parsed)
                    }}
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
            disabled={!selectedRigId || (!consoleEnabled && hasNoLights)}
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
            <LightsDmxPreview lightingConfig={rigConfig} dmxValues={dmxValues} />
          </div>

          <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-lg py-3">
            {rigConfig.frontLights.length > 0 &&
              renderLightsGroup(rigConfig.frontLights as DmxLight[], 'Front Lights')}
            {rigConfig.backLights.length > 0 &&
              renderLightsGroup([...rigConfig.backLights].reverse() as DmxLight[], 'Back Lights')}
            {rigConfig.strobeType === ConfigStrobeType.Dedicated &&
              rigConfig.strobeLights.length > 0 &&
              renderLightsGroup(rigConfig.strobeLights as DmxLight[], 'Strobe Lights')}
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
