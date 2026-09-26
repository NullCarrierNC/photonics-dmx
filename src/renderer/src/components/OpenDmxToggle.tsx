import { useAtom } from 'jotai'
import { openDmxComPortAtom, senderOpenDmxEnabledAtom, lightingPrefsAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import { OPEN_DMX_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import SenderToggle from './controls/SenderToggle'

interface OpenDmxToggleProps {
  /**
   * Holds the switch off for a reason outside this sender's own settings. A running sender can
   * still be switched off.
   */
  notReady?: boolean
  disabled?: boolean
  compact?: boolean
}

const OpenDmxToggle = ({
  notReady = false,
  disabled = false,
  compact = false,
}: OpenDmxToggleProps) => {
  const [comPort] = useAtom(openDmxComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const dmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ

  return (
    <SenderToggle
      senderId="opendmx"
      label="OpenDMX Out"
      runningAtom={senderOpenDmxEnabledAtom}
      prefsFlag="openDmxEnabled"
      // Nothing to open until a COM port or device path is set.
      notReady={notReady || comPort.length < 3}
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'opendmx', devicePath: comPort, dmxSpeed })}
    />
  )
}

export default OpenDmxToggle
