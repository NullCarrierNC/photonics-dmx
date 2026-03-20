import * as React from 'react'
import { useEffect } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import AudioPreviewPage from '../pages/AudioPreviewPage'
import { useAudioPreviewMirror } from '../hooks/useAudioPreviewMirror'

const AudioPreviewWindow: React.FC = () => {
  useEffect(() => {
    document.title = 'Audio Preview - Photonics'
  }, [])

  useAudioPreviewMirror()

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200 overflow-y-auto">
      <ErrorBoundary name="AudioPreview">
        <AudioPreviewPage />
      </ErrorBoundary>
    </div>
  )
}

export default AudioPreviewWindow
