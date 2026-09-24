import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useAtom, useStore } from 'jotai'
import {
  senderArtNetEnabledAtom,
  senderSacnEnabledAtom,
  senderEnttecProEnabledAtom,
  senderOpenDmxEnabledAtom,
  artNetConfigAtom,
  sacnConfigAtom,
  enttecProComPortAtom,
  openDmxComPortAtom,
  lightingPrefsAtom,
} from '../atoms'
import DmxOutputEnabledModes, { type SenderName } from './DmxOutputSettings/DmxOutputEnabledModes'
import SacnConfigCard from './DmxOutputSettings/SacnConfigCard'
import ArtNetConfigCard from './DmxOutputSettings/ArtNetConfigCard'
import EnttecProConfigCard from './DmxOutputSettings/EnttecProConfigCard'
import OpenDmxConfigCard from './DmxOutputSettings/OpenDmxConfigCard'
import {
  getNetworkInterfaces,
  enableSender,
  disableSender,
  updateSacnConfig,
  updateArtNetConfig,
  updateEnttecConfig,
} from '../ipcApi'
import {
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  DMX_OUTPUT_REFRESH_RATE_HZ_MIN,
  ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ,
  normalizeEnttecProDmxSpeedHz,
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
} from '../../../shared/dmxOutputRefresh'
import {
  clampRefreshRateValue,
  nextOutputConfig,
  parseGlobalPublishingRate,
  parseOpenDmxSpeed,
  type DmxOutputFlag,
} from './DmxOutputSettings/outputConfig'
import { useSerializedConfigCommit } from './DmxOutputSettings/useSerializedConfigCommit'
import { applySenderRunState } from '../ipc/senderSwitch'
import { persistPrefs } from '../ipc/persistPrefs'
import { wasRefused } from '../ipc/ipcResult'
import { useToast } from '../hooks/useToast'
import type { AppPreferences } from '../../../shared/ipcTypes'
import { DraftNumberField } from './controls/DraftField'
import { createLogger } from '../../../shared/logger'

const log = createLogger('DmxOutputSettings')

const ENTTEC_PRO_DEFAULT_CONFIG = { port: '', dmxSpeed: ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ }
const OPEN_DMX_DEFAULT_CONFIG = { port: '', dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ }

const DmxOutputSettings: React.FC = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom)
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom)
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom)
  const [isOpenDmxEnabled, setIsOpenDmxEnabled] = useAtom(senderOpenDmxEnabledAtom)
  const [artNetConfig] = useAtom(artNetConfigAtom)
  const [sacnConfig] = useAtom(sacnConfigAtom)
  const [comPort, setComPort] = useAtom(enttecProComPortAtom)
  const [openDmxComPort, setOpenDmxComPort] = useAtom(openDmxComPortAtom)
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const store = useStore()
  // Flag saves run one at a time, each built from the config the one before it saved.
  const flagSaves = useRef<Promise<unknown>>(Promise.resolve())
  const enttecProSpeed = prefs.enttecProConfig?.dmxSpeed ?? ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ
  const openDmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ
  const globalDmxPublishingRate = prefs.globalDmxPublishingRateHz ?? DMX_OUTPUT_REFRESH_RATE_HZ_MAX
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false

  const [artNetExpanded, setArtNetExpanded] = useState(false)
  const [sacnExpanded, setSacnExpanded] = useState(false)
  const [enttecProExpanded, setEnttecProExpanded] = useState(false)
  const [openDmxExpanded, setOpenDmxExpanded] = useState(false)
  const [savingSenders, setSavingSenders] = useState<ReadonlySet<SenderName>>(() => new Set())
  const [networkInterfaces, setNetworkInterfaces] = useState<
    Array<{ name: string; value: string; family: string }>
  >([])
  const { showToast } = useToast()

  /** Writes preferences, reporting a refusal on screen. */
  const persist = useCallback(
    (updates: Partial<AppPreferences>, what: string) =>
      persistPrefs(updates, what, (message) => showToast(message, 'error', 5000)),
    [showToast],
  )

  /**
   * Hands a committed configuration to the sender that is already running, reporting on screen
   * when it will not take it. A refused change leaves that sender stopped, so silence here reads
   * as output that simply went away.
   */
  const applyToRunningSender = useCallback(
    async (apply: () => Promise<unknown>, what: string) => {
      try {
        const result = await apply()
        if (wasRefused(result)) {
          showToast(`Could not apply ${what}. ${result.error ?? ''}`.trim(), 'error', 5000)
        }
      } catch (error) {
        log.error(`Failed to apply ${what}:`, error)
        showToast(`Could not apply ${what}.`, 'error', 5000)
      }
    },
    [showToast],
  )

  /**
   * Persists Enttec port/rate atomically and pushes the merged config to main. The push goes out
   * whether or not this render thinks the sender runs, because a sender enabled a moment ago may
   * not show as running here yet. Main applies it to a running or starting sender and ignores it
   * otherwise.
   */
  const commitEnttecConfig = useSerializedConfigCommit({
    stored: prefs.enttecProConfig ?? ENTTEC_PRO_DEFAULT_CONFIG,
    persist: (config, what) => persist({ enttecProConfig: config }, what),
    setStored: (config) => setPrefs((prev) => ({ ...prev, enttecProConfig: config })),
    applyToRunningSender: (config, what) =>
      applyToRunningSender(
        () => updateEnttecConfig({ devicePath: config.port, dmxSpeed: config.dmxSpeed }),
        what,
      ),
  })

  /** Persists OpenDMX port/rate atomically. OpenDMX has no live-update channel to push to. */
  const commitOpenDmxConfig = useSerializedConfigCommit({
    stored: prefs.openDmxConfig ?? OPEN_DMX_DEFAULT_CONFIG,
    persist: (config, what) => persist({ openDmxConfig: config }, what),
    setStored: (config) => setPrefs((prev) => ({ ...prev, openDmxConfig: config })),
  })

  /** Persists the whole resolved ArtNet config and hands it to the sender if it runs. */
  const commitArtNetConfig = useSerializedConfigCommit({
    stored: artNetConfig,
    persist: (config, what) => persist({ artNetConfig: config }, what),
    setStored: (config) => setPrefs((prev) => ({ ...prev, artNetConfig: config })),
    applyToRunningSender: async (config, what) => {
      if (isArtNetEnabled) await applyToRunningSender(() => updateArtNetConfig(config), what)
    },
  })

  /** Persists the whole resolved sACN config and hands it to the sender if it runs. */
  const commitSacnConfig = useSerializedConfigCommit({
    stored: sacnConfig,
    persist: (config, what) => persist({ sacnConfig: config }, what),
    setStored: (config) => setPrefs((prev) => ({ ...prev, sacnConfig: config })),
    applyToRunningSender: async (config, what) => {
      if (isSacnEnabled) await applyToRunningSender(() => updateSacnConfig(config), what)
    },
  })

  // The port fields hold their own text while they are being edited and report on blur, so the
  // atoms can simply follow what is stored.
  const storedEnttecPort = prefs.enttecProConfig?.port ?? ''
  const storedOpenDmxPort = prefs.openDmxConfig?.port ?? ''

  useEffect(() => {
    setComPort(storedEnttecPort)
  }, [storedEnttecPort, setComPort])

  useEffect(() => {
    setOpenDmxComPort(storedOpenDmxPort)
  }, [storedOpenDmxPort, setOpenDmxComPort])

  // Which cards are open is stored too, so it follows preferences on its own.
  const dmxSettingsPrefs = prefs.dmxSettingsPrefs
  useEffect(() => {
    if (!dmxSettingsPrefs) {
      return
    }
    /* eslint-disable react-hooks/set-state-in-effect -- sync expansion state from prefs */
    setArtNetExpanded(dmxSettingsPrefs.artNetExpanded || false)
    setSacnExpanded(dmxSettingsPrefs.sacnExpanded || false)
    setEnttecProExpanded(dmxSettingsPrefs.enttecProExpanded || false)
    setOpenDmxExpanded(dmxSettingsPrefs.openDmxExpanded || false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dmxSettingsPrefs])

  // Load network interfaces for sACN configuration
  useEffect(() => {
    const loadNetworkInterfaces = async () => {
      try {
        const result = await getNetworkInterfaces()
        if (result.success) {
          setNetworkInterfaces(result.interfaces)
        } else {
          log.error('Failed to load network interfaces:', result.error)
        }
      } catch (error) {
        log.error('Error loading network interfaces:', error)
      }
    }

    void loadNetworkInterfaces()
  }, [])

  /** What one sender needs to be turned on or off: its saved flag and its backend state. */
  type SenderToggle = {
    flag: DmxOutputFlag
    isRunning: boolean
    setRunning: (value: boolean) => void
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
  }

  const senderToggles: Record<SenderName, SenderToggle> = {
    sacn: {
      flag: 'sacnEnabled',
      isRunning: isSacnEnabled,
      setRunning: setIsSacnEnabled,
      start: () => enableSender({ sender: 'sacn', ...sacnConfig }),
      stop: () => disableSender({ sender: 'sacn' }),
    },
    artnet: {
      flag: 'artNetEnabled',
      isRunning: isArtNetEnabled,
      setRunning: setIsArtNetEnabled,
      start: () => enableSender({ sender: 'artnet', ...artNetConfig }),
      stop: () => disableSender({ sender: 'artnet' }),
    },
    enttecpro: {
      flag: 'enttecProEnabled',
      isRunning: isEnttecProEnabled,
      setRunning: setIsEnttecProEnabled,
      start: () =>
        enableSender({ sender: 'enttecpro', devicePath: comPort, dmxSpeed: enttecProSpeed }),
      stop: () => disableSender({ sender: 'enttecpro' }),
    },
    opendmx: {
      flag: 'openDmxEnabled',
      isRunning: isOpenDmxEnabled,
      setRunning: setIsOpenDmxEnabled,
      start: () =>
        enableSender({
          sender: 'opendmx',
          devicePath: openDmxComPort,
          dmxSpeed: openDmxSpeed,
        }),
      stop: () => disableSender({ sender: 'opendmx' }),
    },
  }

  /**
   * Flips one sender in the saved config and brings the backend into line with it. The checkbox
   * follows the saved config while starting and stopping follows what the backend reports, so a
   * sender already in the state being asked for is left running, or stopped, as it is.
   */
  const saveSenderFlag = async (name: SenderName) => {
    const toggle = senderToggles[name]
    const current = store.get(lightingPrefsAtom).dmxOutputConfig
    const enabled = !(current?.[toggle.flag] ?? false)
    const newConfig = nextOutputConfig(current, toggle.flag, enabled)
    log.info('Sender toggled:', name, enabled, newConfig)

    if (!(await persist({ dmxOutputConfig: newConfig }, 'the DMX output configuration'))) {
      return
    }

    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    if (enabled !== toggle.isRunning) {
      await applySenderRunState(name, enabled, toggle.setRunning, () =>
        enabled ? toggle.start() : toggle.stop(),
      )
    }
  }

  /** Holds the sender's box while its flag saves, so a second click cannot ask again. */
  const handleSenderToggle = async (name: SenderName) => {
    if (savingSenders.has(name)) return
    const markSaving = (saving: boolean) =>
      setSavingSenders((current) => {
        const next = new Set(current)
        if (saving) next.add(name)
        else next.delete(name)
        return next
      })
    markSaving(true)
    const saving = flagSaves.current.then(() => saveSenderFlag(name))
    flagSaves.current = saving.catch(() => undefined)
    await saving.finally(() => markSaving(false))
  }

  const handleArtNetConfigChange = (
    field: keyof typeof artNetConfig,
    value: string | number,
  ): Promise<boolean> => {
    const parsed = field === 'refreshRateHz' ? clampRefreshRateValue(value) : value
    return commitArtNetConfig({ [field]: parsed }, 'the ArtNet configuration')
  }

  const handleComPortChange = async (newPort: string): Promise<boolean> => {
    setComPort(newPort)
    const saved = await commitEnttecConfig({ port: newPort }, 'the Enttec Pro port')
    if (!saved) setComPort(storedEnttecPort)
    return saved
  }

  const handleEnttecProSpeedChange = (hz: number): Promise<boolean> =>
    commitEnttecConfig(
      { dmxSpeed: normalizeEnttecProDmxSpeedHz(hz) },
      'the Enttec Pro refresh rate',
    )

  const handleOpenDmxComPortChange = async (newPort: string): Promise<boolean> => {
    setOpenDmxComPort(newPort)
    const saved = await commitOpenDmxConfig({ port: newPort }, 'the OpenDMX port')
    if (!saved) setOpenDmxComPort(storedOpenDmxPort)
    return saved
  }

  const handleOpenDmxSpeedChange = (hz: number): Promise<boolean> =>
    commitOpenDmxConfig({ dmxSpeed: parseOpenDmxSpeed(String(hz)) }, 'the OpenDMX rate')

  const handleGlobalDmxRateChange = async (hz: number): Promise<boolean> => {
    const sanitized = parseGlobalPublishingRate(String(hz))

    if (!(await persist({ globalDmxPublishingRateHz: sanitized }, 'the DMX publishing rate'))) {
      return false
    }

    setPrefs((prev) => ({ ...prev, globalDmxPublishingRateHz: sanitized }))
    return true
  }

  const handleSacnConfigChange = (
    field: keyof typeof sacnConfig,
    value: string | number | boolean,
  ): Promise<boolean> => {
    const parsed = field === 'refreshRateHz' ? clampRefreshRateValue(value) : value
    return commitSacnConfig({ [field]: parsed }, 'the sACN configuration')
  }

  const panelSetters = {
    artNetExpanded: setArtNetExpanded,
    sacnExpanded: setSacnExpanded,
    enttecProExpanded: setEnttecProExpanded,
    openDmxExpanded: setOpenDmxExpanded,
  }

  /** Opens or closes one sender's panel and saves the layout all four share. */
  const toggleExpanded = async (panel: keyof typeof panelSetters): Promise<void> => {
    const newDmxSettingsPrefs = {
      artNetExpanded,
      sacnExpanded,
      enttecProExpanded,
      openDmxExpanded,
    }
    newDmxSettingsPrefs[panel] = !newDmxSettingsPrefs[panel]
    panelSetters[panel](newDmxSettingsPrefs[panel])

    if (!(await persist({ dmxSettingsPrefs: newDmxSettingsPrefs }, 'the panel layout'))) {
      return
    }

    setPrefs((prev) => ({
      ...prev,
      dmxSettingsPrefs: newDmxSettingsPrefs,
    }))
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        DMX Output Configuration
      </h2>

      {advancedModeEnabled && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
            Global DMX Publishing Rate
          </h3>
          <div className="flex items-center gap-2">
            <DraftNumberField
              aria-label="Global DMX Publishing Rate"
              value={globalDmxPublishingRate}
              onCommit={handleGlobalDmxRateChange}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              min={DMX_OUTPUT_REFRESH_RATE_HZ_MIN}
              max={DMX_OUTPUT_REFRESH_RATE_HZ_MAX}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Hz ({DMX_OUTPUT_REFRESH_RATE_HZ_MIN}–{DMX_OUTPUT_REFRESH_RATE_HZ_MAX})
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
            Caps how often the publisher hands frames to all enabled DMX outputs. This sits upstream
            of the individual outputs - each enabled adapter can still be set lower by its own
            refresh rate. Lower this if you see flicker, dropouts, or sluggishness on cheap USB or
            low-end sACN/ArtNet adapters that can&apos;t keep up. The default (
            {DMX_OUTPUT_REFRESH_RATE_HZ_MAX} Hz) is the DMX-512 ceiling.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
            NOTE: This should always be the same or higher than the fastest refresh rate of the
            individual DMX outputs.{' '}
            <em>
              Lower this only as a last resort after lowering the DMX Output you&apos;re
              using&apos;s refresh rate
            </em>
            .
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
            CAUTION: When using regular PAR style DMX lights as strobes, the faster this value the
            better the strobe will look. Lowering this value will limit how quickly the strobes can
            flash.
          </p>
        </div>
      )}

      <DmxOutputEnabledModes
        saving={savingSenders}
        sacnEnabled={prefs.dmxOutputConfig?.sacnEnabled || false}
        onSacnToggle={() => void handleSenderToggle('sacn')}
        artNetEnabled={prefs.dmxOutputConfig?.artNetEnabled || false}
        onArtNetToggle={() => void handleSenderToggle('artnet')}
        enttecProEnabled={prefs.dmxOutputConfig?.enttecProEnabled || false}
        onEnttecProToggle={() => void handleSenderToggle('enttecpro')}
        openDmxEnabled={prefs.dmxOutputConfig?.openDmxEnabled || false}
        onOpenDmxToggle={() => void handleSenderToggle('opendmx')}
      />

      {prefs.dmxOutputConfig?.sacnEnabled && (
        <div className="mb-6">
          <SacnConfigCard
            config={sacnConfig}
            networkInterfaces={networkInterfaces}
            expanded={sacnExpanded}
            onToggle={() => void toggleExpanded('sacnExpanded')}
            onConfigChange={handleSacnConfigChange}
          />
        </div>
      )}

      {prefs.dmxOutputConfig?.artNetEnabled && (
        <div className="mb-6">
          <ArtNetConfigCard
            config={artNetConfig}
            expanded={artNetExpanded}
            onToggle={() => void toggleExpanded('artNetExpanded')}
            onConfigChange={handleArtNetConfigChange}
          />
        </div>
      )}

      {prefs.dmxOutputConfig?.enttecProEnabled && (
        <div>
          <EnttecProConfigCard
            comPort={comPort}
            refreshRate={enttecProSpeed}
            onComPortChange={handleComPortChange}
            onRefreshRateChange={handleEnttecProSpeedChange}
            expanded={enttecProExpanded}
            onToggle={() => void toggleExpanded('enttecProExpanded')}
          />
        </div>
      )}

      {prefs.dmxOutputConfig?.openDmxEnabled && (
        <div className="mt-6">
          <OpenDmxConfigCard
            comPort={openDmxComPort}
            refreshRate={openDmxSpeed}
            onComPortChange={handleOpenDmxComPortChange}
            onRefreshRateChange={handleOpenDmxSpeedChange}
            expanded={openDmxExpanded}
            onToggle={() => void toggleExpanded('openDmxExpanded')}
          />
        </div>
      )}
    </div>
  )
}

export default DmxOutputSettings
