import { useAtom } from 'jotai'
import { senderArtNetEnabledAtom, artNetConfigAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface ArtNetToggleProps {
  /**
   * Holds the switch off for a reason outside this sender's own settings. A running sender can
   * still be switched off.
   */
  notReady?: boolean
  disabled?: boolean
  compact?: boolean
}

const ArtNetToggle = ({
  notReady = false,
  disabled = false,
  compact = false,
}: ArtNetToggleProps) => {
  const [artNetConfig] = useAtom(artNetConfigAtom)

  return (
    <SenderToggle
      senderId="artnet"
      label="ArtNet Out"
      runningAtom={senderArtNetEnabledAtom}
      prefsFlag="artNetEnabled"
      // Nothing to send to until the host is a plausible address.
      notReady={notReady || artNetConfig.host.length < 7}
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'artnet', ...artNetConfig })}
    />
  )
}

export default ArtNetToggle
