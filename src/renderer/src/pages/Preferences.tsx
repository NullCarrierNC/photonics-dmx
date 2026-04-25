import React, { useCallback, useState } from 'react'
import YargEnabledCueGroups from '../components/YargEnabledCueGroups'
import AudioEnabledCueGroups from '../components/AudioEnabledCueGroups'
import MotionEnabledCueGroups from '../components/MotionEnabledCueGroups'
import MotionMasterToggle from '../components/MotionMasterToggle'
import CueConsistencySettings from '../components/CueConsistencySettings'
import DmxOutputSettings from '../components/DmxOutputSettings'
import StageKitModeSettings from '../components/StageKitModeSettings'
import BrightnessSettings from '../components/BrightnessSettings'
import ClockRateSettings from '../components/ClockRateSettings'
import ActiveRigsSettings from '../components/ActiveRigsSettings'

const Preferences: React.FC = () => {
  const [motionMasterEnabled, setMotionMasterEnabled] = useState(true)
  const onMotionEnabledChange = useCallback((enabled: boolean) => {
    setMotionMasterEnabled(enabled)
  }, [])

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Preferences</h1>
      <ActiveRigsSettings />
      <DmxOutputSettings />
      <BrightnessSettings />

      <YargEnabledCueGroups />
      <AudioEnabledCueGroups />
      <MotionMasterToggle onMotionEnabledChange={onMotionEnabledChange} />
      <div
        className={`space-y-2 ${motionMasterEnabled ? '' : 'opacity-50 pointer-events-none transition-opacity'}`}>
        <MotionEnabledCueGroups platform="yarg" />
        <MotionEnabledCueGroups platform="audio" />
      </div>
      <StageKitModeSettings />
      <CueConsistencySettings motionGloballyEnabled={motionMasterEnabled} />
      <ClockRateSettings />
    </div>
  )
}

export default Preferences
