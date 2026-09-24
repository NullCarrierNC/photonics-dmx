import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import type { ILightingController } from '../../controllers/sequencer/interfaces'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'
import type { AudioCueType } from '../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../runtime/broadcaster'
import { createMockLightingConfig } from '../helpers/testFixtures'
import { fakeLightingController } from '../helpers/fakeLightingController'

const GROUP = 'audio-motion-shared-group'

function makeCue(cueType: AudioCueType): IAudioCue {
  return {
    id: `id:${cueType}`,
    cueType,
    name: cueType,
    description: '',
    style: 'primary',
    execute: jest.fn(async () => {}) as IAudioCue['execute'],
    onStop: jest.fn(),
  }
}

describe('audio motion across two rigs', () => {
  let registry: AudioCueRegistry
  let fanout: ChainFanout
  let sequencers: ILightingController[]
  let processor: AudioCueProcessor
  let probability: number
  let motionChanges: unknown[]
  const motionA = makeCue('motion-a')
  const motionB = makeCue('motion-b')

  const chain = (rigId: string, isPrimary: boolean, sequencer: ILightingController): RigChain =>
    ({
      rigId,
      isPrimary,
      dmxLightManager: new DmxLightManager(createMockLightingConfig()),
      sequencer,
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    }) as unknown as RigChain

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    registry = AudioCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup({
      id: GROUP,
      name: 'Test',
      description: '',
      cues: new Map<AudioCueType, IAudioCue>([
        ['wash', makeCue('wash')],
        ['pulse', makeCue('pulse')],
      ]),
    })
    jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(motionA)
      .mockReturnValueOnce(motionB)
    jest
      .spyOn(registry, 'findMotionCueRef')
      .mockImplementation((cue) => ({ groupId: 'motion', cueId: cue.cueType }))

    sequencers = [fakeLightingController(), fakeLightingController()]
    fanout = new ChainFanout()
    fanout.setChains([chain('A', true, sequencers[0]), chain('B', false, sequencers[1])])
    probability = 100
    motionChanges = []
    const broadcaster: RuntimeBroadcaster = {
      emit: (channel, payload) => {
        if (channel === RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE) motionChanges.push(payload)
      },
    }
    processor = new AudioCueProcessor(
      fanout,
      broadcaster,
      DEFAULT_AUDIO_CONFIG,
      'wash',
      null,
      () => 0,
      () => probability,
    )
  })

  afterEach(() => {
    processor.shutdown()
    registry.reset()
    jest.restoreAllMocks()
  })

  const runningOn = (): Array<string | undefined> =>
    fanout.getChains().map((c) => c.audioCueHandler?.getRunningMotionCue().ref?.cueId)

  it('draws once and runs the same motion cue on every rig', () => {
    expect(registry.getRandomMotionCue).toHaveBeenCalledTimes(1)
    expect(runningOn()).toEqual(['motion-a', 'motion-a'])
    expect(motionChanges).toEqual([
      { ref: { groupId: 'motion', cueId: 'motion-a' }, source: 'auto', manualFallback: false },
    ])
  })

  it('rolls the probability once for every rig', () => {
    probability = 50
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
    fanout.audioSyncSlots('pulse', null, null, false)

    expect(runningOn()).toEqual(['motion-b', 'motion-b'])
  })

  it('homes every rig when the probability roll for a new primary misses', () => {
    probability = 0
    fanout.audioSyncSlots('pulse', null, null, false)

    expect(runningOn()).toEqual([undefined, undefined])
    for (const sequencer of sequencers) {
      expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    }
  })
})
