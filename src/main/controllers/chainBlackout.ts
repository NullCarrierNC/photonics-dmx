import type { RigChain } from './RigChain'
import { createLogger } from '../../shared/logger'

const log = createLogger('chainBlackout')

/**
 * Clears every chain's running effects and blacks it out, so a multi-rig setup leaves no secondary
 * rig lit when an input stops. A chain that fails is logged and the rest still go dark.
 *
 * @param reason Names what stopped, for the log, e.g. `disabling YARG`.
 */
export async function clearAndBlackOutChains(
  chains: readonly RigChain[],
  reason: string,
): Promise<void> {
  for (const chain of chains) {
    try {
      chain.sequencer.removeAllEffects()
      await chain.sequencer.blackout(0)
    } catch (error) {
      log.error(`Error clearing effects on rig ${chain.rigId} when ${reason}:`, error)
    }
  }
  log.info(`Cleared running effects and blacked out every rig (${reason})`)
}
