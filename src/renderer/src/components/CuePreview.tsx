import React, { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { yargListenerEnabledAtom, rb3eListenerEnabledAtom } from '../atoms'
import { CONFIG } from '../../../shared/ipcChannels'
import CuePreviewYarg from './CuePreviewYarg'
import CuePreviewRb3e from './CuePreviewRb3e'
import CuePreviewAudio from './CuePreviewAudio'

interface CuePreviewProps {
  className?: string
  showBeatIndicator?: boolean
  showMeasureIndicator?: boolean
  showKeyframeIndicator?: boolean
  manualBeatType?: string
  manualMeasureType?: string
  manualKeyframeType?: string
}

const CuePreview: React.FC<CuePreviewProps> = ({
  className = '',
  showBeatIndicator = false,
  showMeasureIndicator = false,
  showKeyframeIndicator = false,
  manualBeatType = 'Manual Beat',
  manualMeasureType = 'Manual Measure',
  manualKeyframeType = 'Manual Keyframe',
}) => {
  const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom)
  const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom)
  const [audioEnabled, setAudioEnabled] = useState(false)

  // Check audio enabled state
  useEffect(() => {
    const checkAudioState = async () => {
      try {
        const enabled = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_ENABLED)
        setAudioEnabled(enabled)
      } catch (error) {
        console.error('Failed to check audio enabled state:', error)
      }
    }

    checkAudioState()

    // Poll for audio state changes every 500ms
    const interval = setInterval(checkAudioState, 500)
    return () => clearInterval(interval)
  }, [])

  // Derive platform from listener state. Priority: RB3E > YARG > AUDIO
  const platform = rb3eListenerEnabled
    ? 'RB3E'
    : yargListenerEnabled
      ? 'YARG'
      : audioEnabled
        ? 'AUDIO'
        : null

  // Render the appropriate component based on platform
  if (platform === 'RB3E') {
    return <CuePreviewRb3e className={className} />
  } else if (platform === 'YARG') {
    return (
      <CuePreviewYarg
        className={className}
        showBeatIndicator={showBeatIndicator}
        showMeasureIndicator={showMeasureIndicator}
        showKeyframeIndicator={showKeyframeIndicator}
        manualBeatType={manualBeatType}
        manualMeasureType={manualMeasureType}
        manualKeyframeType={manualKeyframeType}
      />
    )
  } else if (platform === 'AUDIO') {
    return <CuePreviewAudio className={className} />
  }

  // Default state when no platform is detected yet
  return (
    <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg mt-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-1">Cue Preview</h3>
      <p className="text-gray-500 dark:text-gray-400">
        {platform === null ? 'You must enable YARG, RB3E, or Audio' : 'Waiting for data...'}
      </p>
    </div>
  )
}

export default CuePreview
