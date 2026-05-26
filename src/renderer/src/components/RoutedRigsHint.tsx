import { useAtomValue } from 'jotai'
import { dmxRigsAtom } from '../atoms'
import type { WireSenderId } from '../../../photonics-dmx/types'

interface Props {
  senderId: WireSenderId
  /** Skip rendering entirely (e.g. compact rows in the moving-head calibration wizard). */
  compact?: boolean
}

/**
 * Small hint rendered under each wire-sender toggle. Shows the active rigs currently routed
 * to this sender's protocol so the user can tell at a glance which rig(s) flow here.
 *
 * Visibility gate: only renders when at least one rig has explicit `outputs` set. With all
 * rigs on the default (everything goes everywhere) the hint would just repeat the rig list
 * under every switch — pure noise. Routing has to actually differentiate something for the
 * label to add value.
 *
 * Active rigs only: the hint describes what's flowing now. An inactive rig with `outputs`
 * set isn't contributing data; showing it would suggest it is. Reactivating the rig updates
 * the hint immediately via the Jotai atom subscription.
 *
 * Returns `null` in compact mode (used by the calibration wizard's tight inline rows).
 */
export function RoutedRigsHint({ senderId, compact = false }: Props): JSX.Element | null {
  const rigs = useAtomValue(dmxRigsAtom)
  if (compact) return null

  const routingDefined = rigs.some((r) => r.outputs !== undefined)
  if (!routingDefined) return null

  const names = rigs
    .filter((r) => r.active && (r.outputs === undefined || r.outputs.includes(senderId)))
    .map((r) => r.name)

  if (names.length === 0) {
    return (
      <p className="text-[11px] italic text-gray-500 dark:text-gray-400 mt-1">
        No active rig routed
      </p>
    )
  }
  return <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">{names.join(', ')}</p>
}
