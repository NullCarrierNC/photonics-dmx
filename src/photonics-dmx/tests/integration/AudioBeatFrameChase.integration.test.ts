import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../controllers/RigChain'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { AudioNodeCue } from '../../cues/node/runtime/AudioNodeCue'
import type { AudioCueLayerStyle, AudioEventNodeUnion } from '../../cues/types/nodeCueTypes'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'
import type { AudioLightingData } from '../../listeners/Audio/AudioTypes'
import { noopRuntimeBroadcaster } from '../../runtime/broadcaster'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { makeTwoRigs } from '../helpers/multiRigFixtures'
import { beatStartChase } from '../helpers/beatStartChase'

const GROUP = 'audio-beat-frame-chase'

/** A primary that draws nothing, so a chase in another slot is all the rig shows. */
const darkCue: IAudioCue = {
  id: 'id:dark',
  cueType: 'dark',
  name: 'dark',
  description: '',
  style: 'primary',
  execute: () => {},
}

const loudBeatFrame = (): AudioLightingData => ({
  timestamp: Date.now(),
  overallLevel: 0.95,
  bpm: 120,
  beatDetected: true,
  energy: 0.95,
})

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('an audio chase started on a beat frame', () => {
  let perfNowSpy: ReturnType<typeof jest.spyOn>
  let registry: AudioCueRegistry
  let clock: ManualTestClock
  let chains: RigChain[]
  let processor: AudioCueProcessor | null

  beforeEach(() => {
    jest.useFakeTimers()
    clock = new ManualTestClock()
    // Past the processor's minimum gap between beats, so the first frame's beat is raised.
    clock.tick(1000)
    perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs())
    registry = AudioCueRegistry.getInstance()
    registry.reset()
    chains = makeTwoRigs({ frontPerRig: 2 }).map(
      (rig) => new RigChain({ rigId: rig.id, config: rig.config, clock, isPrimary: false }),
    )
    processor = null
  })

  afterEach(() => {
    processor?.shutdown()
    for (const chain of chains) chain.dispose()
    registry.reset()
    perfNowSpy.mockRestore()
    jest.useRealTimers()
  })

  /** Each rig's front row red levels, in chase order, once the chase's first frame is published. */
  async function playChaseOnBeatFrame(slot: AudioCueLayerStyle): Promise<number[][]> {
    const chase = new AudioNodeCue(
      GROUP,
      NodeCueCompiler.compileCue<AudioEventNodeUnion>(beatStartChase('chase', slot), 'audio'),
    )
    registry.registerGroup({
      id: GROUP,
      name: GROUP,
      description: '',
      cues: new Map<string, IAudioCue>([
        [darkCue.cueType, darkCue],
        [chase.cueType, chase],
      ]),
    })
    const fanout = new ChainFanout()
    fanout.setChains(chains)
    processor = new AudioCueProcessor(
      fanout,
      noopRuntimeBroadcaster(),
      {
        ...DEFAULT_AUDIO_CONFIG,
        strobeEnabled: slot === 'strobe',
        strobeTriggerThreshold: 0.8,
        strobeProbability: 100,
      },
      slot === 'primary' ? chase.cueType : darkCue.cueType,
      slot === 'secondary' ? chase.cueType : null,
    )
    processor.start()

    processor.processAudioData(loudBeatFrame())
    await flushMicrotasks()
    clock.tick(10)

    return chains.map((chain) =>
      chain.dmxLightManager
        .getLights(['front'], ['all'])
        .map((light) => chain.lightStateManager.getLightState(light.id)?.red ?? 0),
    )
  }

  it.each<AudioCueLayerStyle>(['primary'])(
    'shows its first step on every rig from the %s slot',
    async (slot) => {
      const rigs = await playChaseOnBeatFrame(slot)

      expect(rigs).toEqual([
        [255, 0],
        [255, 0],
      ])
    },
  )
})
