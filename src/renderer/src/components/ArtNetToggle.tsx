import { useAtom } from 'jotai'
import { senderArtNetEnabledAtom, artNetConfigAtom, lightingPrefsAtom } from '../atoms'
import { enableSender, disableSender } from '../ipcApi'
import { RoutedRigsHint } from './RoutedRigsHint'
import { createLogger } from '../../../shared/logger'
const log = createLogger('ArtNetToggle')

interface ArtNetToggleProps {
  disabled?: boolean
  compact?: boolean
}

const ArtNetToggle = ({ disabled = false, compact = false }: ArtNetToggleProps) => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom)
  const [artNetConfig] = useAtom(artNetConfigAtom)
  const [prefs] = useAtom(lightingPrefsAtom)

  const handleToggle = () => {
    const newState = !isArtNetEnabled
    setIsArtNetEnabled(newState)

    if (newState) {
      enableSender({ sender: 'artnet', ...artNetConfig })
      log.info('ArtNet enabled')
    } else {
      disableSender({ sender: 'artnet' })
      log.info('ArtNet disabled')
    }
  }

  // Only show the toggle if ArtNet is enabled in preferences
  if (!prefs.dmxOutputConfig?.artNetEnabled) {
    return null
  }

  return (
    <div className={compact ? 'flex flex-col gap-1 shrink-0' : 'flex flex-col mb-4 w-[190px]'}>
      <div
        className={
          compact
            ? 'flex items-center gap-2 justify-between'
            : 'flex items-center gap-4 justify-between'
        }>
        <label
          className={`${compact ? 'text-sm font-medium' : 'text-lg font-semibold'} ${
            disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
          ArtNet Out
        </label>
        <button
          onClick={handleToggle}
          disabled={artNetConfig.host.length < 7 || disabled}
          className={`${compact ? 'w-9 h-5' : 'w-12 h-6'} rounded-full transition-colors ${
            isArtNetEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            artNetConfig.host.length < 7 || disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}>
          <div
            className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isArtNetEnabled ? (compact ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'
            }`}></div>
        </button>
      </div>
      <RoutedRigsHint senderId="artnet" compact={compact} />
    </div>
  )
}

export default ArtNetToggle
