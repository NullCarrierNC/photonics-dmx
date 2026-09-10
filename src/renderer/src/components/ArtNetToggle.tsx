import { useAtom } from 'jotai'
import { senderArtNetEnabledAtom, artNetConfigAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface ArtNetToggleProps {
  disabled?: boolean
  compact?: boolean
}

const ArtNetToggle = ({ disabled = false, compact = false }: ArtNetToggleProps) => {
  const [artNetConfig] = useAtom(artNetConfigAtom)

  return (
    <SenderToggle
      senderId="artnet"
      label="ArtNet Out"
      runningAtom={senderArtNetEnabledAtom}
      prefsFlag="artNetEnabled"
      // Nothing to send to until the host is a plausible address.
      notReady={artNetConfig.host.length < 7}
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'artnet', ...artNetConfig })}
    />
  )
}

export default ArtNetToggle
