import React from 'react'
import AudioToggle from '../components/AudioToggle'
import CuePreviewAudio from '../components/CuePreviewAudio'

const AudioPreviewPage: React.FC = () => {
  return (
    <div className="p-6 pb-4">
      <div className="flex flex-row items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Audio Preview</h1>
        <AudioToggle className="mb-0 w-auto min-w-[190px]" />
      </div>
      <CuePreviewAudio showTitle={false} />
    </div>
  )
}

export default AudioPreviewPage
