import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import YargEnabledCueGroups from '../components/YargEnabledCueGroups'
import AudioEnabledCueGroups from '../components/AudioEnabledCueGroups'
import MotionEnabledCueGroups from '../components/MotionEnabledCueGroups'
import MotionMasterToggle from '../components/MotionMasterToggle'
import CueConsistencySettings from '../components/CueConsistencySettings'
import DmxOutputSettings from '../components/DmxOutputSettings'
import StageKitYargPrioritySettings from '../components/StageKitYargPrioritySettings'
import YargFallbackSettings from '../components/YargFallbackSettings'
import StageKitRb3EnhancedSettings from '../components/StageKitRb3EnhancedSettings'
import BrightnessSettings from '../components/BrightnessSettings'
import ClockRateSettings from '../components/ClockRateSettings'
import ActiveRigsSettings from '../components/ActiveRigsSettings'
import AudioPreferencesTabContent from '../components/AudioPreferencesTabContent'
import AdvancedModeSettings from '../components/AdvancedModeSettings'
import { getMotionEnabled } from '../ipcApi'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

type PreferencesTabId = 'dmxOut' | 'yarg' | 'rb3' | 'audio' | 'advanced'

const ALL_TABS: { id: PreferencesTabId; label: string }[] = [
  { id: 'dmxOut', label: 'DMX Out' },
  { id: 'yarg', label: 'YARG' },
  { id: 'rb3', label: 'RB3' },
  { id: 'audio', label: 'Audio' },
  { id: 'advanced', label: 'Advanced' },
]

const Preferences: React.FC = () => {
  const [prefs] = useAtom(lightingPrefsAtom)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false

  const baseId = useId()
  const [activeTab, setActiveTab] = useState<PreferencesTabId>('dmxOut')
  const [motionMasterEnabled, setMotionMasterEnabled] = useState(true)
  const onMotionEnabledChange = useCallback((enabled: boolean) => {
    setMotionMasterEnabled(enabled)
  }, [])

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => t.id !== 'audio' || advancedModeEnabled),
    [advancedModeEnabled],
  )

  /** When Audio is hidden, treat selection as DMX Out so we never render a hidden tab (no effect setState). */
  const effectiveTab = useMemo(
    () => (!advancedModeEnabled && activeTab === 'audio' ? 'dmxOut' : activeTab),
    [advancedModeEnabled, activeTab],
  )

  useEffect(() => {
    let cancelled = false
    void getMotionEnabled()
      .then((v) => {
        if (!cancelled && typeof v === 'boolean') {
          setMotionMasterEnabled(v)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onBroadcast = (value: boolean) => {
      setMotionMasterEnabled(value)
    }
    addIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onBroadcast)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, onBroadcast)
    }
  }, [])

  const tabId = (tab: PreferencesTabId) => `${baseId}-${tab}-tab`
  const panelId = (tab: PreferencesTabId) => `${baseId}-${tab}-panel`

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Preferences</h1>

      <div
        role="tablist"
        aria-label="Preference categories"
        className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-600 pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={effectiveTab === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={effectiveTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              effectiveTab === tab.id
                ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId('dmxOut')}
        aria-labelledby={tabId('dmxOut')}
        hidden={effectiveTab !== 'dmxOut'}
        className="space-y-2">
        {effectiveTab === 'dmxOut' && (
          <>
            {advancedModeEnabled && <ActiveRigsSettings />}
            <DmxOutputSettings />
            <BrightnessSettings />
          </>
        )}
      </div>

      <div
        role="tabpanel"
        id={panelId('yarg')}
        aria-labelledby={tabId('yarg')}
        hidden={effectiveTab !== 'yarg'}
        className="space-y-2">
        {effectiveTab === 'yarg' && (
          <>
            <YargEnabledCueGroups />
            {motionMasterEnabled && <MotionEnabledCueGroups platform="yarg" />}
            <StageKitYargPrioritySettings />
            <YargFallbackSettings />
          </>
        )}
      </div>

      <div
        role="tabpanel"
        id={panelId('rb3')}
        aria-labelledby={tabId('rb3')}
        hidden={effectiveTab !== 'rb3'}
        className="space-y-2">
        {effectiveTab === 'rb3' && <StageKitRb3EnhancedSettings />}
      </div>

      {advancedModeEnabled && (
        <div
          role="tabpanel"
          id={panelId('audio')}
          aria-labelledby={tabId('audio')}
          hidden={effectiveTab !== 'audio'}
          className="space-y-2">
          {effectiveTab === 'audio' && (
            <>
              <AudioPreferencesTabContent />
              <AudioEnabledCueGroups />
              {motionMasterEnabled && <MotionEnabledCueGroups platform="audio" />}
            </>
          )}
        </div>
      )}

      <div
        role="tabpanel"
        id={panelId('advanced')}
        aria-labelledby={tabId('advanced')}
        hidden={effectiveTab !== 'advanced'}
        className="space-y-2">
        {effectiveTab === 'advanced' && (
          <>
            <AdvancedModeSettings />
            {advancedModeEnabled && (
              <>
                <MotionMasterToggle onMotionEnabledChange={onMotionEnabledChange} />
                <CueConsistencySettings motionGloballyEnabled={motionMasterEnabled} />
                <ClockRateSettings />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Preferences
