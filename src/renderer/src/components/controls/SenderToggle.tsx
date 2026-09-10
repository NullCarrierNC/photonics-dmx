import React from 'react'
import { useAtom, type PrimitiveAtom } from 'jotai'
import { lightingPrefsAtom, type LightingPreferences } from '../../atoms'
import { disableSender } from '../../ipcApi'
import { applySenderRunState } from '../../ipc/senderSwitch'
import { RoutedRigsHint } from '../RoutedRigsHint'
import { ToggleSwitch } from './ToggleSwitch'
import type { WireSenderId } from '../../../../photonics-dmx/types'

type OutputConfig = NonNullable<LightingPreferences['dmxOutputConfig']>

export interface SenderToggleProps {
  /** Sender id as the main process knows it. */
  senderId: WireSenderId
  label: string
  /** Toggle state for this sender, so the row reflects what is actually running. */
  runningAtom: PrimitiveAtom<boolean>
  /** The output-config flag that decides whether this sender is offered at all. */
  prefsFlag: keyof OutputConfig
  /** Builds the enable call, which carries whatever configuration this sender needs. */
  enable: () => Promise<unknown> | unknown
  /** Blocks the switch when this sender is not configured well enough to start. */
  notReady?: boolean
  disabled?: boolean
  compact?: boolean
}

/**
 * One output sender's on/off row: the switch, the preference gate that hides senders the user has
 * not turned on, and the hint naming which rigs route to it.
 *
 * Each sender differs only in what it sends to start, which arrives as a callback.
 */
const SenderToggle: React.FC<SenderToggleProps> = ({
  senderId,
  label,
  runningAtom,
  prefsFlag,
  enable,
  notReady = false,
  disabled = false,
  compact = false,
}) => {
  const [isRunning, setIsRunning] = useAtom(runningAtom)
  const [prefs] = useAtom(lightingPrefsAtom)

  const handleToggle = (): void => {
    const wanted = !isRunning
    void applySenderRunState(senderId, wanted, setIsRunning, () =>
      wanted ? enable() : disableSender({ sender: senderId }),
    )
  }

  if (!prefs.dmxOutputConfig?.[prefsFlag]) {
    return null
  }

  return (
    <div className={compact ? 'flex flex-col gap-1 shrink-0' : 'flex flex-col mb-4 w-[190px]'}>
      <ToggleSwitch
        label={label}
        checked={isRunning}
        onToggle={handleToggle}
        disabled={notReady || disabled}
        compact={compact}
      />
      <RoutedRigsHint senderId={senderId} compact={compact} />
    </div>
  )
}

export default SenderToggle
