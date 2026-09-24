import { jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { DmxPublisher, type PublisherTiming } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import type { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { noopRuntimeBroadcaster } from '../../runtime/broadcaster'
import type { DmxRig } from '../../types'

/** One buffer as it reached the sender, stamped with the clock the publisher reads. */
export interface WireFrame {
  atMs: number
  buffer: Readonly<Record<number, number>>
}

export interface RecordingPublisherOptions {
  rigs: DmxRig[]
  chains: Array<{ rigId: string; lightStateManager: LightStateManager }>
  strobeState?: StrobeStateManager
  /** The publisher's output rate. Omitted, every frame goes straight out. */
  outputRateHz?: number
  /** The rate governor's clock and timers. Omitted, the real ones. */
  timing?: PublisherTiming
}

export interface RecordingPublisher {
  publisher: DmxPublisher
  strobeState: StrobeStateManager
  /** Every buffer the sACN slot sent, in order. */
  frames: WireFrame[]
  /** The most recent buffer, or null before the first send. */
  last: () => Readonly<Record<number, number>> | null
  shutdown: () => void
}

/**
 * A real DmxPublisher in chain mode whose one wire sender is a recording sACN slot, so a test reads
 * levels and strobe toggles off the buffers that would have gone out.
 */
export function createRecordingPublisher(options: RecordingPublisherOptions): RecordingPublisher {
  const senderManager = new SenderManager({
    broadcaster: noopRuntimeBroadcaster(),
    hasReceivers: () => false,
  })
  const frames: WireFrame[] = []
  jest.spyOn(senderManager, 'getEnabledWireSenders').mockReturnValue(['sacn'])
  jest.spyOn(senderManager, 'send').mockImplementation((_wireId, buffer) => {
    frames.push({ atMs: performance.now(), buffer: { ...buffer } })
    return Promise.resolve(true)
  })
  const strobeState = options.strobeState ?? new StrobeStateManager()
  const publisher = new DmxPublisher(senderManager, null, strobeState, {
    outputRateHz: options.outputRateHz,
    timing: options.timing,
  })
  publisher.setRigChains(options.chains)
  publisher.updateActiveRigs(options.rigs)
  return {
    publisher,
    strobeState,
    frames,
    last: () => (frames.length > 0 ? frames[frames.length - 1].buffer : null),
    shutdown: () => publisher.shutdown(),
  }
}
