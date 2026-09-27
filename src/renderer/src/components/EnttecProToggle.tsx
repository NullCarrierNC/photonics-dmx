import { useAtom } from 'jotai'
import { ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ } from '../../../shared/dmxOutputRefresh'
import { senderEnttecProEnabledAtom, enttecProComPortAtom, lightingPrefsAtom } from '../atoms'
import { enableSender } from '../ipcApi'
import SenderToggle from './controls/SenderToggle'

interface EnttecProToggleProps {
  /**
   * Holds the switch off for a reason outside this sender's own settings. A running sender can
   * still be switched off.
   */
  notReady?: boolean
  disabled?: boolean
  compact?: boolean
}

const EnttecProToggle = ({
  notReady = false,
  disabled = false,
  compact = false,
}: EnttecProToggleProps) => {
  const [comPort] = useAtom(enttecProComPortAtom)
  const [prefs] = useAtom(lightingPrefsAtom)
  const dmxSpeed = prefs.enttecProConfig?.dmxSpeed ?? ENTTEC_PRO_DEFAULT_REFRESH_RATE_HZ

  return (
    <SenderToggle
      senderId="enttecpro"
      label="Enttec Pro Out"
      runningAtom={senderEnttecProEnabledAtom}
      prefsFlag="enttecProEnabled"
      // Nothing to open until a COM port or device path is set.
      notReady={notReady || comPort.length < 3}
      disabled={disabled}
      compact={compact}
      enable={() => enableSender({ sender: 'enttecpro', devicePath: comPort, dmxSpeed })}
    />
  )
}

export default EnttecProToggle
