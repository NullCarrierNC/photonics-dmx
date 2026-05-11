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
  clampDmxOutputRefreshRateHz,
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
} from '../../../shared/dmxOutputRefresh'
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

  // Load DMX output configuration independently
  useEffect(() => {
    log.info('Checking DMX output configuration state')
    log.info('Preferences dmxOutputConfig:', prefs.dmxOutputConfig)

    // Check if preferences need to be initialized
    if (!prefs.dmxOutputConfig) {
      log.info('No DMX output config in preferences, initializing from sender states')

      // Initialize from current sender states
      const initialConfig = {
        sacnEnabled: isSacnEnabled,
        artNetEnabled: isArtNetEnabled,
        enttecProEnabled: isEnttecProEnabled,
        openDmxEnabled: isOpenDmxEnabled,
      }

      log.info('Initializing dmxOutputConfig from sender states:', initialConfig)

      // Save the initial configuration to preferences
      setPrefs((prev) => ({
        ...prev,
        dmxOutputConfig: initialConfig,
      }))

      savePrefs({ dmxOutputConfig: initialConfig }).catch((error) => {
        log.error('Failed to save initial DMX output configuration:', error)
      })
    }
  }, [
    prefs.dmxOutputConfig,
    isSacnEnabled,
    isArtNetEnabled,
    isEnttecProEnabled,
    isOpenDmxEnabled,
    setPrefs,
  ])

  const handleSacnToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.sacnEnabled || false
    log.info('sACN toggle clicked, current state:', currentState)
    const newState = !currentState
    const newConfig = {
      ...prefs.dmxOutputConfig,
      sacnEnabled: newState,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false,
    }

    // Update the global preferences
    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    // If enabling sACN, start the sender
    if (newState && !isSacnEnabled) {
      enableSender({ sender: 'sacn', ...sacnConfig })
      setIsSacnEnabled(true) // Turn on the toggle state
    }

    // If disabling sACN, stop the sender if it's running and turn off the toggle
    if (!newState && isSacnEnabled) {
      log.info('Disabling sACN checkbox - stopping sACN sender and turning off toggle')
      disableSender({ sender: 'sacn' })
      setIsSacnEnabled(false) // Turn off the toggle state
    }

    try {
      const result = await savePrefs({ dmxOutputConfig: newConfig })
      log.info('Save result:', result)
    } catch (error) {
      log.error('Failed to save DMX output configuration:', error)
    }
  }

  const handleArtNetToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.artNetEnabled || false
    log.info('ArtNet toggle clicked, current state:', currentState)
    const newState = !currentState
    const newConfig = {
      ...prefs.dmxOutputConfig,
      artNetEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false,
    }

    log.info('Setting new config:', newConfig)

    // Update the global preferences
    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    // If enabling ArtNet, start the sender
    if (newState && !isArtNetEnabled) {
      log.info('Enabling ArtNet checkbox - starting ArtNet sender')
      enableSender({ sender: 'artnet', ...artNetConfig })
      setIsArtNetEnabled(true) // Turn on the toggle state
    }

    // If disabling ArtNet, stop the sender if it's running and turn off the toggle
    if (!newState && isArtNetEnabled) {
      log.info('Disabling ArtNet checkbox - stopping ArtNet sender and turning off toggle')
      disableSender({ sender: 'artnet' })
      setIsArtNetEnabled(false) // Turn off the toggle state
    }

    try {
      const result = await savePrefs({ dmxOutputConfig: newConfig })
      log.info('Save result:', result)
    } catch (error) {
      log.error('Failed to save DMX output configuration:', error)
    }
  }

  const handleEnttecProToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.enttecProEnabled || false
    log.info('Enttec Pro toggle clicked, current state:', currentState)
    const newState = !currentState
    const newConfig = {
      ...prefs.dmxOutputConfig,
      enttecProEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false,
    }

    log.info('Setting new config:', newConfig)

    // Update the global preferences
    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    // If enabling Enttec Pro, start the sender
    if (newState && !isEnttecProEnabled) {
      log.info('Enabling Enttec Pro checkbox - starting Enttec Pro sender')
      enableSender({ sender: 'enttecpro', devicePath: comPort })
      setIsEnttecProEnabled(true) // Turn on the toggle state
    }

    // If disabling Enttec Pro, stop the sender if it's running and turn off the toggle
    if (!newState && isEnttecProEnabled) {
      log.info('Disabling Enttec Pro checkbox - stopping Enttec Pro sender and turning off toggle')
      disableSender({ sender: 'enttecpro' })
      setIsEnttecProEnabled(false) // Turn off the toggle state
    }

    try {
      const result = await savePrefs({ dmxOutputConfig: newConfig })
      log.info('Save result:', result)
    } catch (error) {
      log.error('Failed to save DMX output configuration:', error)
    }
  }

  const handleOpenDmxToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.openDmxEnabled || false
    log.info('OpenDMX toggle clicked, current state:', currentState)
    const newState = !currentState
    const newConfig = {
      ...prefs.dmxOutputConfig,
      openDmxEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false,
    }

    log.info('Setting new config:', newConfig)

    setPrefs((prev) => ({
      ...prev,
      dmxOutputConfig: newConfig,
    }))

    if (newState && !isOpenDmxEnabled) {
      log.info('Enabling OpenDMX checkbox - starting OpenDMX sender')
      enableSender({ sender: 'opendmx', devicePath: openDmxComPort, dmxSpeed: openDmxSpeed })
      setIsOpenDmxEnabled(true)
    }

    if (!newState && isOpenDmxEnabled) {
      log.info('Disabling OpenDMX checkbox - stopping OpenDMX sender and turning off toggle')
      disableSender({ sender: 'opendmx' })
      setIsOpenDmxEnabled(false)
    }

    try {
      const result = await savePrefs({ dmxOutputConfig: newConfig })
      log.info('Save result:', result)
    } catch (error) {
      log.error('Failed to save DMX output configuration:', error)
    }
  }

  const handleArtNetConfigChange = async (
    field: keyof typeof artNetConfig,
    value: string | number,
  ) => {
    const parsed =
      field === 'refreshRateHz'
        ? clampDmxOutputRefreshRateHz(
            typeof value === 'number' && Number.isFinite(value)
              ? value
              : DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
          )
        : value
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
    const parsed = parseInt(e.target.value, 10)
    const sanitized =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(44, Math.max(1, parsed))
        : OPEN_DMX_DEFAULT_REFRESH_RATE_HZ

    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ }),
      dmxSpeed: sanitized,
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

  const handleSacnConfigChange = async (
    field: keyof typeof sacnConfig,
    value: string | number | boolean,
  ) => {
    const parsed =
      field === 'refreshRateHz'
        ? clampDmxOutputRefreshRateHz(
            typeof value === 'number' && Number.isFinite(value)
              ? value
              : DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
          )
        : value
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

      <DmxOutputEnabledModes
        sacnEnabled={prefs.dmxOutputConfig?.sacnEnabled || false}
        onSacnToggle={handleSacnToggle}
        artNetEnabled={prefs.dmxOutputConfig?.artNetEnabled || false}
        onArtNetToggle={handleArtNetToggle}
        enttecProEnabled={prefs.dmxOutputConfig?.enttecProEnabled || false}
        onEnttecProToggle={handleEnttecProToggle}
        openDmxEnabled={prefs.dmxOutputConfig?.openDmxEnabled || false}
        onOpenDmxToggle={handleOpenDmxToggle}
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
