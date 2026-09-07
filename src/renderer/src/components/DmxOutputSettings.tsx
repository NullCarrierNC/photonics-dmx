import React, { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
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
import DmxOutputEnabledModes from './DmxOutputSettings/DmxOutputEnabledModes'
import SacnConfigCard from './DmxOutputSettings/SacnConfigCard'
import ArtNetConfigCard from './DmxOutputSettings/ArtNetConfigCard'
import EnttecProConfigCard from './DmxOutputSettings/EnttecProConfigCard'
import OpenDmxConfigCard from './DmxOutputSettings/OpenDmxConfigCard'
import {
  getNetworkInterfaces,
  enableSender,
  disableSender,
  savePrefs,
  updateSacnConfig,
  updateArtNetConfig,
} from '../ipcApi'
import {
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  DMX_OUTPUT_REFRESH_RATE_HZ_MIN,
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
} from '../../../shared/dmxOutputRefresh'
import {
  clampRefreshRateValue,
  nextOutputConfig,
  outputConfigFromRunningSenders,
  parseGlobalPublishingRate,
  parseOpenDmxSpeed,
  type DmxOutputFlag,
} from './DmxOutputSettings/outputConfig'
import { createLogger } from '../../../shared/logger'

const log = createLogger('DmxOutputSettings')

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
  const openDmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ
  const globalDmxPublishingRate = prefs.globalDmxPublishingRateHz ?? DMX_OUTPUT_REFRESH_RATE_HZ_MAX
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false

  const [artNetExpanded, setArtNetExpanded] = useState(false)
  const [sacnExpanded, setSacnExpanded] = useState(false)
  const [enttecProExpanded, setEnttecProExpanded] = useState(false)
  const [openDmxExpanded, setOpenDmxExpanded] = useState(false)
  const [networkInterfaces, setNetworkInterfaces] = useState<
    Array<{ name: string; value: string; family: string }>
  >([])

  // Load other preferences (ArtNet config, COM port, etc.)
  useEffect(() => {
    log.info('Loading other preferences')

    setComPort(prefs.enttecProConfig?.port ?? '')
    setOpenDmxComPort(prefs.openDmxConfig?.port ?? '')

    // Load DMX settings UI preferences
    if (prefs.dmxSettingsPrefs) {
      /* eslint-disable react-hooks/set-state-in-effect -- sync expansion state from prefs */
      setArtNetExpanded(prefs.dmxSettingsPrefs.artNetExpanded || false)
      setSacnExpanded(prefs.dmxSettingsPrefs.sacnExpanded || false)
      setEnttecProExpanded(prefs.dmxSettingsPrefs.enttecProExpanded || false)
      setOpenDmxExpanded(prefs.dmxSettingsPrefs.openDmxExpanded || false)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [prefs, setComPort, setOpenDmxComPort])

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

    loadNetworkInterfaces()
  }, [])

  // Seed the saved output config on first run from whatever the backend already has running.
  useEffect(() => {
    if (prefs.dmxOutputConfig) {
      return
    }
    const initialConfig = outputConfigFromRunningSenders({
      sacn: isSacnEnabled,
      artnet: isArtNetEnabled,
      enttecpro: isEnttecProEnabled,
      opendmx: isOpenDmxEnabled,
    })
    log.info('No DMX output config in preferences, initializing from sender states:', initialConfig)

    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: initialConfig,
    }))

    savePrefs({ dmxOutputConfig: initialConfig }).catch((error) => {
      log.error('Failed to save initial DMX output configuration:', error)
    })
  }, [
    prefs.dmxOutputConfig,
    isSacnEnabled,
    isArtNetEnabled,
    isEnttecProEnabled,
    isOpenDmxEnabled,
    setPrefs,
  ])

  /** What one sender needs to be turned on or off: its saved flag and its backend state. */
  type SenderToggle = {
    flag: DmxOutputFlag
    isRunning: boolean
    setRunning: (value: boolean) => void
    start: () => void
    stop: () => void
  }

  type SenderName = 'sacn' | 'artnet' | 'enttecpro' | 'opendmx'

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
      start: () => enableSender({ sender: 'enttecpro', devicePath: comPort }),
      stop: () => disableSender({ sender: 'enttecpro' }),
    },
    opendmx: {
      flag: 'openDmxEnabled',
      isRunning: isOpenDmxEnabled,
      setRunning: setIsOpenDmxEnabled,
      start: () =>
        enableSender({ sender: 'opendmx', devicePath: openDmxComPort, dmxSpeed: openDmxSpeed }),
      stop: () => disableSender({ sender: 'opendmx' }),
    },
  }

  /**
   * Flips one sender in the saved config and brings the backend into line with it. The checkbox
   * follows the saved config while starting and stopping follows what the backend reports, so a
   * sender already in the state being asked for is left running, or stopped, as it is.
   */
  const handleSenderToggle = async (name: SenderName) => {
    const toggle = senderToggles[name]
    const enabled = !(prefs.dmxOutputConfig?.[toggle.flag] ?? false)
    const newConfig = nextOutputConfig(prefs.dmxOutputConfig, toggle.flag, enabled)
    log.info('Sender toggled:', name, enabled, newConfig)

    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    if (enabled && !toggle.isRunning) {
      toggle.start()
      toggle.setRunning(true)
    }
    if (!enabled && toggle.isRunning) {
      toggle.stop()
      toggle.setRunning(false)
    }

    try {
      await savePrefs({ dmxOutputConfig: newConfig })
    } catch (error) {
      log.error('Failed to save DMX output configuration:', error)
    }
  }

  const handleArtNetConfigChange = async (
    field: keyof typeof artNetConfig,
    value: string | number,
  ) => {
    const parsed = field === 'refreshRateHz' ? clampRefreshRateValue(value) : value
    const newConfig = {
      ...artNetConfig,
      [field]: parsed,
    }

    try {
      await savePrefs({ artNetConfig: newConfig })

      setPrefs((prev) => ({
        ...prev,
        artNetConfig: newConfig,
      }))

      if (isArtNetEnabled) {
        await updateArtNetConfig(newConfig)
      }
    } catch (error) {
      log.error('Failed to save ArtNet configuration:', error)
    }
  }

  const handleComPortChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value
    setComPort(newPort)

    const newConfig = {
      ...(prefs.enttecProConfig ?? { port: '' }),
      port: newPort,
    }

    try {
      await savePrefs({ enttecProConfig: newConfig })

      // Update the preferences atom to reflect the change
      setPrefs((prev) => ({
        ...prev,
        enttecProConfig: newConfig,
      }))
    } catch (error) {
      log.error('Failed to save EnttecPro port configuration:', error)
    }
  }

  const handleOpenDmxComPortChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value
    setOpenDmxComPort(newPort)

    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ }),
      port: newPort,
    }

    try {
      await savePrefs({ openDmxConfig: newConfig })

      setPrefs((prev) => ({
        ...prev,
        openDmxConfig: newConfig,
      }))
    } catch (error) {
      log.error('Failed to save OpenDMX port configuration:', error)
    }
  }

  const handleOpenDmxSpeedChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ }),
      dmxSpeed: parseOpenDmxSpeed(e.target.value),
    }

    try {
      await savePrefs({ openDmxConfig: newConfig })

      setPrefs((prev) => ({
        ...prev,
        openDmxConfig: newConfig,
      }))
    } catch (error) {
      log.error('Failed to save OpenDMX speed configuration:', error)
    }
  }

  const handleGlobalDmxRateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = parseGlobalPublishingRate(e.target.value)

    try {
      await savePrefs({ globalDmxPublishingRateHz: sanitized })
      setPrefs((prev) => ({ ...prev, globalDmxPublishingRateHz: sanitized }))
    } catch (error) {
      log.error('Failed to save Global DMX Publishing Rate:', error)
    }
  }

  const handleSacnConfigChange = async (
    field: keyof typeof sacnConfig,
    value: string | number | boolean,
  ) => {
    const parsed = field === 'refreshRateHz' ? clampRefreshRateValue(value) : value
    const newConfig = {
      ...sacnConfig,
      [field]: parsed,
    }

    try {
      // Save to preferences
      await savePrefs({ sacnConfig: newConfig })

      // Update the preferences atom to reflect the change
      setPrefs((prev) => ({
        ...prev,
        sacnConfig: newConfig,
      }))

      // Update the running sender if sACN is enabled
      if (isSacnEnabled) {
        await updateSacnConfig(newConfig)
      }
    } catch (error) {
      log.error('Failed to save sACN configuration:', error)
    }
  }

  // Save expanded state changes
  const saveExpandedStates = async (
    artNet: boolean,
    sacn: boolean,
    enttecPro: boolean,
    openDmx: boolean,
  ) => {
    const newDmxSettingsPrefs = {
      artNetExpanded: artNet,
      sacnExpanded: sacn,
      enttecProExpanded: enttecPro,
      openDmxExpanded: openDmx,
    }

    try {
      await savePrefs({ dmxSettingsPrefs: newDmxSettingsPrefs })

      setPrefs((prev) => ({
        ...prev,
        dmxSettingsPrefs: newDmxSettingsPrefs,
      }))
    } catch (error) {
      log.error('Failed to save DMX settings preferences:', error)
    }
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
            <input
              type="number"
              value={globalDmxPublishingRate}
              onChange={handleGlobalDmxRateChange}
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
        sacnEnabled={prefs.dmxOutputConfig?.sacnEnabled || false}
        onSacnToggle={() => handleSenderToggle('sacn')}
        artNetEnabled={prefs.dmxOutputConfig?.artNetEnabled || false}
        onArtNetToggle={() => handleSenderToggle('artnet')}
        enttecProEnabled={prefs.dmxOutputConfig?.enttecProEnabled || false}
        onEnttecProToggle={() => handleSenderToggle('enttecpro')}
        openDmxEnabled={prefs.dmxOutputConfig?.openDmxEnabled || false}
        onOpenDmxToggle={() => handleSenderToggle('opendmx')}
      />

      {prefs.dmxOutputConfig?.sacnEnabled && (
        <div className="mb-6">
          <SacnConfigCard
            config={sacnConfig}
            networkInterfaces={networkInterfaces}
            expanded={sacnExpanded}
            onToggle={() => {
              const newSacnExpanded = !sacnExpanded
              setSacnExpanded(newSacnExpanded)
              saveExpandedStates(
                artNetExpanded,
                newSacnExpanded,
                enttecProExpanded,
                openDmxExpanded,
              )
            }}
            onConfigChange={handleSacnConfigChange}
          />
        </div>
      )}

      {prefs.dmxOutputConfig?.artNetEnabled && (
        <div className="mb-6">
          <ArtNetConfigCard
            config={artNetConfig}
            expanded={artNetExpanded}
            onToggle={() => {
              const newArtNetExpanded = !artNetExpanded
              setArtNetExpanded(newArtNetExpanded)
              saveExpandedStates(
                newArtNetExpanded,
                sacnExpanded,
                enttecProExpanded,
                openDmxExpanded,
              )
            }}
            onConfigChange={handleArtNetConfigChange}
          />
        </div>
      )}

      {prefs.dmxOutputConfig?.enttecProEnabled && (
        <div>
          <EnttecProConfigCard
            comPort={comPort}
            onComPortChange={handleComPortChange}
            expanded={enttecProExpanded}
            onToggle={() => {
              const newEnttecProExpanded = !enttecProExpanded
              setEnttecProExpanded(newEnttecProExpanded)
              saveExpandedStates(
                artNetExpanded,
                sacnExpanded,
                newEnttecProExpanded,
                openDmxExpanded,
              )
            }}
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
            onToggle={() => {
              const newOpenDmxExpanded = !openDmxExpanded
              setOpenDmxExpanded(newOpenDmxExpanded)
              saveExpandedStates(
                artNetExpanded,
                sacnExpanded,
                enttecProExpanded,
                newOpenDmxExpanded,
              )
            }}
          />
        </div>
      )}
    </div>
  )
}

export default DmxOutputSettings
