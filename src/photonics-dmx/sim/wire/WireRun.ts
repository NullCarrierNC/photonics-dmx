import { RigChain } from '../../controllers/RigChain'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import type { PublisherSenders } from '../../controllers/SenderManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../cues/registries/cueRegistries'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import type { DmxRig } from '../../types'
import type { WireClock } from './RealTimeClock'

/** One buffer as it left the publisher for the wire, stamped with the virtual clock. */
export interface WireSend {
  ms: number
  buffer: Readonly<Record<number, number>>
}

export interface WireRunOptions {
  rig: DmxRig
  clock: WireClock
  /** Receives every buffer the publisher sends to its one wire slot. */
  onSend: (send: WireSend) => void
  /** Also hands each buffer to a real sender, whose result the publisher sees. */
  forward?: (buffer: Record<number, number>) => Promise<boolean>
  /** The publisher's output rate. The app's default is 44 Hz. */
  outputRateHz?: number
  /** The YARG lighting library the registry is limited to. */
  yargLibrary?: string
  /** The audio library the audio registry is limited to. */
  audioLibrary?: string
  /** A manual YARG motion cue, or none to leave motion off. */
  motion?: { groupId: string; cueId: string } | null
}

/**
 * One rig as ControllerGraph builds it: a RigChain on the virtual clock, cue handlers bound to it,
 * and a DmxPublisher subscribed to the chain whose one wire slot hands every buffer to `onSend`.
 * YARG frames go through the real YargNetworkListener, as live YARG input does.
 */
export class WireRun {
  private readonly chain: RigChain
  private readonly strobe = new StrobeStateManager()
  private readonly publisher: DmxPublisher
  private yargHandler: CueHandler | null = null
  private audioHandler: AudioCueHandler | null = null
  private listener: YargNetworkListener | null = null

  constructor(private readonly options: WireRunOptions) {
    const { rig, clock, onSend, forward } = options
    this.chain = new RigChain({ rigId: rig.id, rigLabel: rig.name, config: rig.config, clock })
    const senders: PublisherSenders = {
      getEnabledWireSenders: () => ['sacn'],
      isIpcEnabled: () => false,
      sendIpc: () => {},
      send: (_wireId, buffer) => {
        onSend({ ms: clock.getCurrentTimeMs(), buffer: { ...buffer } })
        return forward ? forward(buffer) : Promise.resolve(true)
      },
    }
    this.publisher = new DmxPublisher(senders, null, this.strobe, {
      outputRateHz: options.outputRateHz ?? 44,
    })
    this.publisher.setRigChains([
      { rigId: this.chain.rigId, lightStateManager: this.chain.lightStateManager },
    ])
    this.publisher.updateActiveRigs([rig])
  }

  /** The YARG input, built on first use with the lighting library and motion cue chosen. */
  public yarg(): YargNetworkListener {
    if (this.listener) {
      return this.listener
    }
    const registry = getCueRegistry('yarg')
    const library = this.options.yargLibrary ?? 'yarg-stagekit'
    registry.setEnabledGroups([library])
    registry.setActiveGroups([library])
    registry.setDefaultGroup(library)
    registry.setStageKitPriority('never')
    const handler = new CueHandler(this.chain.dmxLightManager, this.chain.sequencer, {
      registry,
      strobeState: this.strobe,
      getMotionCueMinimumHoldMs: () => 0,
      getMotionCueProbabilityPercent: () => 100,
    })
    const motion = this.options.motion ?? null
    if (motion) {
      registry.setEnabledMotionGroups([motion.groupId])
      handler.setManualMotionRef(motion)
    }
    handler.setMotionEnabled(motion !== null)
    this.chain.cueHandlers.yarg = handler
    this.yargHandler = handler
    this.listener = new YargNetworkListener(handler)
    return this.listener
  }

  /** The audio cue handler, built on first use with the audio library chosen. */
  public audio(): AudioCueHandler {
    if (this.audioHandler) {
      return this.audioHandler
    }
    const library = this.options.audioLibrary
    if (library === undefined) {
      throw new Error('An audio step needs an audio library')
    }
    AudioCueRegistry.getInstance().setEnabledGroups([library])
    const handler = new AudioCueHandler(this.chain.dmxLightManager, this.chain.sequencer, {
      strobeState: this.strobe,
    })
    handler.setMotionEnabled(false)
    this.chain.audioCueHandler = handler
    this.audioHandler = handler
    return handler
  }

  /** Raises a beat on the rig's sequencer, as the audio processor does on a detected beat. */
  public beat(): void {
    this.chain.sequencer.onBeat()
  }

  /** Tears down the handlers, the publisher and the chain. The clock belongs to the caller. */
  public dispose(): void {
    try {
      this.yargHandler?.shutdown()
      this.audioHandler?.destroy()
      this.publisher.shutdown()
    } finally {
      this.yargHandler = null
      this.audioHandler = null
      this.chain.dispose()
    }
  }
}
