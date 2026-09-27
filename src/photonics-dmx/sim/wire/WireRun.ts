import { EventEmitter } from 'events'
import { RigChain } from '../../controllers/RigChain'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import type { PublisherSenders } from '../../controllers/SenderManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { CueHandler } from '../../cueHandlers/CueHandler'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../cues/registries/cueRegistries'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import {
  parseStageKitData,
  type StageKitPersistentState,
} from '../../listeners/RB3/rb3ePacketParser'
import { Rb3StageKitCueProcessor } from '../../processors/Rb3StageKitCueProcessor'
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
  /** The RB3 library the RB3 registry is limited to. */
  rb3Library?: string
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
  private rb3Handler: CueHandler | null = null
  private rb3Processor: Rb3StageKitCueProcessor | null = null
  private readonly rb3Input = new EventEmitter()
  private stageKitState: StageKitPersistentState = { strobeState: 'Strobe_Off', fogState: false }

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

  /**
   * Hands one RB3E StageKit datagram's two bytes to RB3 cue mode, as the RB3E listener does: parsed
   * with the strobe and fog state the last one left, then to the cue processor, which dispatches to
   * the rig's RB3 cue handler. The first call builds cue mode in game on the RB3 library chosen.
   */
  public stageKit(left: number, right: number): void {
    if (!this.rb3Processor) {
      const registry = getCueRegistry('rb3')
      const library = this.options.rb3Library ?? 'rb3-stagekit'
      registry.setEnabledGroups([library])
      registry.setActiveGroups([library])
      registry.setDefaultGroup(library)
      const handler = new CueHandler(this.chain.dmxLightManager, this.chain.sequencer, {
        registry,
        strobeState: this.strobe,
      })
      handler.setMotionEnabled(false)
      this.chain.cueHandlers.rb3 = handler
      this.rb3Handler = handler
      this.rb3Processor = new Rb3StageKitCueProcessor(handler)
      this.rb3Processor.startListening(this.rb3Input)
      this.rb3Input.emit('rb3e:gameState', { gameState: 'InGame' })
    }
    const { data, state } = parseStageKitData(left, right, this.stageKitState, Date.now())
    this.stageKitState = state
    this.rb3Input.emit('stagekit:data', data)
  }

  /** Raises a beat on the rig's sequencer, as the audio processor does on a detected beat. */
  public beat(): void {
    this.chain.sequencer.onBeat()
  }

  /** Tears down the handlers, the publisher and the chain. The clock belongs to the caller. */
  public dispose(): void {
    try {
      this.rb3Processor?.destroy()
      this.rb3Handler?.shutdown()
      this.yargHandler?.shutdown()
      this.audioHandler?.destroy()
      this.publisher.shutdown()
    } finally {
      this.rb3Processor = null
      this.rb3Handler = null
      this.yargHandler = null
      this.audioHandler = null
      this.chain.dispose()
    }
  }
}
