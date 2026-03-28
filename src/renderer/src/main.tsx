import './styles/app.css'
import * as React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DarkModeProvider } from './DarkModeProvider'
import CueEditorWindow from './windows/CueEditorWindow'
import AudioPreviewWindow from './windows/AudioPreviewWindow'

const getRootComponent = () => {
  const params = new URLSearchParams(window.location.search)
  const windowType = params.get('window')
  if (windowType === 'cue-editor') {
    return <CueEditorWindow />
  }
  if (windowType === 'audio-preview') {
    return <AudioPreviewWindow />
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DarkModeProvider>{getRootComponent()}</DarkModeProvider>
  </React.StrictMode>,
)
