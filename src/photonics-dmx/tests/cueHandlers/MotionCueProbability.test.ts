jest.mock('../../../main/utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { YargCueHandler } from '../../cueHandlers/YargCueHandler'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import type { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { IAudioCue } from '../../cues/interfaces/IAudioCue'
import { AudioCueType } from '../../cues/types/audioCueTypes'
import { createMockLightingConfig } from '../helpers/testFixtures'
import type { AudioConfig } from '../../listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'

class MockPrimary implements INetCue {
  private _id = `p-${Math.random().toString(36).slice(2)}`
  executeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  constructor(public cueId: CueType) {}
  get id(): string {
    return this._id
  }
  description = 'mock'
  style = CueStyle.Primary
  async execute(): Promise<void> {
    return this.executeMock()
  }
  onStop(): void {}
  onPause(): void {}
  onDestroy(): void {}
}

function makeMotionNet(id: string): INetCue {
  return {
    id,
    cueId: CueType.Menu,
    description: 'm',
    style: CueStyle.Primary,
    execute: jest.fn(async () => {}) as INetCue['execute'],
    onStop: jest.fn(),
    onPause: jest.fn(),
    onDestroy: jest.fn(),
  }
}

function makeMotionAudio(id: string): IAudioCue {
  return {
    id,
    cueType: 'motion-x' as AudioCueType,
    name: id,
    description: '',
    style: 'primary',
    execute: jest.fn(async () => {}) as IAudioCue['execute'],
    onStop: jest.fn(),
    onDestroy: jest.fn(),
  }
}

function minimalAudioData(): import('../../listeners/Audio/AudioTypes').AudioLightingData {
  return {
    timestamp: Date.now(),
    overallLevel: 0.5,
    bpm: null,
    beatDetected: false,
    energy: 0.5,
  }
}

const baseCueData: CueData = {
  datagramVersion: 1,
  platform: 'Unknown',
  currentScene: 'Gameplay',
  pauseState: 'Unpaused',
  venueSize: 'Small',
  beatsPerMinute: 120,
  songSection: 'Verse',
  guitarNotes: [],
  bassNotes: [],
  drumNotes: [],
  keysNotes: [],
  vocalNote: 0,
  harmony0Note: 0,
  harmony1Note: 0,
  harmony2Note: 0,
  lightingCue: 'Chorus',
  postProcessing: 'Default',
  fogState: false,
  strobeState: 'Strobe_Off',
  performer: 1,
  keyframe: 'Off',
  bonusEffect: true,
  beat: 'Strong',
  previousCue: 'Intro',
  executionCount: 1,
  cueStartTime: Date.now() - 1000,
  timeSinceLastCue: 100,
  totalScore: 0,
  trackMode: 'tracked',
} as CueData

describe('motion cue probability', () => {
  describe('YargCueHandler', () => {
    let registry: YargCueRegistry
    let lightManager: DmxLightManager
    let sequencer: ILightingController
    let nowSpy: jest.SpiedFunction<() => number>
    let randomSpy: jest.SpiedFunction<typeof Math.random>
    let probability = 100

    const buildHandler = (): YargCueHandler => {
      const handler = new YargCueHandler(lightManager, sequencer, {
        getMotionCueMinimumHoldMs: () => 0,
        getMotionCueProbabilityPercent: () => probability,
      })
      handler.setMotionEnabled(true)
      return handler
    }

    beforeEach(() => {
      probability = 100
      registry = YargCueRegistry.getInstance()
      registry.reset()
      const def = new MockPrimary(CueType.Default)
      const verse = new MockPrimary(CueType.Verse)
      const chorus = new MockPrimary(CueType.Chorus)
      const motionM1 = makeMotionNet('m1-inst')
      const mockGroup: ICueGroup = {
        id: 'mock-default',
        name: 'mock-default',
        description: 'test',
        cues: new Map<CueType, INetCue>([
          [CueType.Default, def],
          [CueType.Verse, verse],
          [CueType.Chorus, chorus],
        ]),
        motionCues: new Map<string, INetCue>([['m1', motionM1]]),
      }
      registry.registerGroup(mockGroup)
      registry.setDefaultGroup(mockGroup.id)
      registry.activateGroup(mockGroup.id)
      registry.setEnabledMotionGroups([mockGroup.id])

      const config = createMockLightingConfig()
      lightManager = new DmxLightManager(config)
      sequencer = {
        addEffect: jest.fn(),
        setEffect: jest.fn(),
        removeEffect: jest.fn(),
        removeAllEffects: jest.fn(),
        removeEffectByLayer: jest.fn(),
        addEffectUnblockedName: jest.fn(),
        setEffectUnblockedName: jest.fn(),
        cancelPanTiltClear: jest.fn(),
        schedulePanTiltClear: jest.fn(),
        addMotionPattern: jest.fn(),
        removeMotionPattern: jest.fn(),
        getMotionPattern: jest.fn().mockReturnValue(undefined),
        updateMotionPatternConfig: jest.fn(),
        onBeat: jest.fn(),
      } as unknown as ILightingController

      nowSpy = jest.spyOn(Date, 'now')
      nowSpy.mockReturnValue(1_000_000)
      randomSpy = jest.spyOn(Math, 'random')
      randomSpy.mockReturnValue(0)
    })

    afterEach(() => {
      nowSpy.mockRestore()
      randomSpy.mockRestore()
      registry.reset()
    })

    it('always picks a motion cue at 100%', async () => {
      probability = 100
      const motion = makeMotionNet('rand')
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'rand' })

      const handler = buildHandler()
      randomSpy.mockReturnValue(0.99)
      await handler.handleCue(CueType.Default, baseCueData)

      expect(randSpy).toHaveBeenCalledTimes(1)
      expect(motion.execute).toHaveBeenCalledTimes(1)
      expect(sequencer.schedulePanTiltClear).not.toHaveBeenCalled()
    })

    it('clears motion and schedules pan/tilt clear when roll fails', async () => {
      probability = 100
      const motion = makeMotionNet('rand')
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'rand' })

      const handler = buildHandler()
      randomSpy.mockReturnValue(0)
      await handler.handleCue(CueType.Default, baseCueData)
      expect(motion.execute).toHaveBeenCalledTimes(1)

      probability = 0
      ;(sequencer.schedulePanTiltClear as jest.Mock).mockClear()
      randSpy.mockClear()
      randomSpy.mockReturnValue(0.5)
      await handler.handleCue(CueType.Verse, baseCueData)

      expect(randSpy).not.toHaveBeenCalled()
      expect(motion.onStop).toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    })

    it('manual motion ref is not gated by probability', async () => {
      probability = 0
      const manualMotion = makeMotionNet('manual')
      jest.spyOn(registry, 'getMotionCueImplementation').mockReturnValue(manualMotion)
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue')
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'm1' })

      const handler = buildHandler()
      handler.setManualMotionRef({ groupId: 'mock-default', cueId: 'm1' })
      randomSpy.mockReturnValue(0.99)

      await handler.handleCue(CueType.Default, baseCueData)

      expect(manualMotion.execute).toHaveBeenCalledTimes(1)
      expect(randSpy).not.toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).not.toHaveBeenCalled()
    })

    it('picks when Math.random < probability/100, clears when >=', async () => {
      probability = 50
      const motion = makeMotionNet('rand')
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'rand' })

      const handler = buildHandler()

      randomSpy.mockReturnValue(0.49)
      await handler.handleCue(CueType.Default, baseCueData)
      expect(randSpy).toHaveBeenCalledTimes(1)
      expect(motion.execute).toHaveBeenCalledTimes(1)

      randSpy.mockClear()
      ;(sequencer.schedulePanTiltClear as jest.Mock).mockClear()

      randomSpy.mockReturnValue(0.5)
      await handler.handleCue(CueType.Verse, baseCueData)
      expect(randSpy).not.toHaveBeenCalled()
      expect(motion.onStop).toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    })
  })

  describe('AudioCueHandler', () => {
    const GROUP = 'probability-audio'
    let registry: AudioCueRegistry
    let lightManager: DmxLightManager
    let sequencer: ILightingController
    let audioConfig: AudioConfig
    let nowSpy: jest.SpiedFunction<() => number>
    let randomSpy: jest.SpiedFunction<typeof Math.random>
    let probability = 100
    let m1: IAudioCue
    let m2: IAudioCue

    const buildHandler = (): AudioCueHandler =>
      new AudioCueHandler(lightManager, sequencer, {
        getMotionCueMinimumHoldMs: () => 0,
        getMotionCueProbabilityPercent: () => probability,
      })

    beforeEach(() => {
      probability = 100
      registry = AudioCueRegistry.getInstance()
      registry.reset()
      const primaryA = makeMotionAudio('pa')
      const primaryB = makeMotionAudio('pb')
      m1 = makeMotionAudio('m1')
      m2 = makeMotionAudio('m2')
      registry.registerGroup({
        id: GROUP,
        name: 'T',
        description: '',
        cues: new Map<AudioCueType, IAudioCue>([
          ['pa', primaryA],
          ['pb', primaryB],
        ]),
        motionCues: new Map([
          ['m1', m1],
          ['m2', m2],
        ]),
      })
      registry.setEnabledMotionGroups([GROUP])

      const config = createMockLightingConfig()
      lightManager = new DmxLightManager(config)
      sequencer = {
        addEffect: jest.fn(),
        setEffect: jest.fn(),
        removeEffect: jest.fn(),
        removeAllEffects: jest.fn(),
        removeEffectByLayer: jest.fn(),
        addEffectUnblockedName: jest.fn(),
        setEffectUnblockedName: jest.fn(),
        cancelPanTiltClear: jest.fn(),
        schedulePanTiltClear: jest.fn(),
        onBeat: jest.fn(),
      } as unknown as ILightingController

      audioConfig = { ...DEFAULT_AUDIO_CONFIG }
      nowSpy = jest.spyOn(Date, 'now')
      nowSpy.mockReturnValue(2_000_000)
      randomSpy = jest.spyOn(Math, 'random')
      randomSpy.mockReturnValue(0)
    })

    afterEach(() => {
      nowSpy.mockRestore()
      randomSpy.mockRestore()
      registry.reset()
    })

    it('always picks a motion cue at 100%', async () => {
      probability = 100
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(m1)
      jest.spyOn(registry, 'findAudioMotionCueRef').mockReturnValue({ groupId: GROUP, cueId: 'm1' })

      const handler = buildHandler()
      randomSpy.mockReturnValue(0.99)
      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, false)

      expect(randSpy).toHaveBeenCalledTimes(1)
      expect(m1.execute).toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).not.toHaveBeenCalled()
    })

    it('clears motion and schedules pan/tilt clear when roll fails', async () => {
      probability = 100
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(m1)
      jest.spyOn(registry, 'findAudioMotionCueRef').mockReturnValue({ groupId: GROUP, cueId: 'm1' })

      const handler = buildHandler()
      randomSpy.mockReturnValue(0)
      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, false)
      expect(m1.execute).toHaveBeenCalled()

      probability = 0
      ;(sequencer.schedulePanTiltClear as jest.Mock).mockClear()
      randSpy.mockClear()
      randomSpy.mockReturnValue(0.5)
      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pb', null, null, 0, false)

      expect(randSpy).not.toHaveBeenCalled()
      expect(m1.onStop).toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    })

    it('manual motion ref is not gated by probability', async () => {
      probability = 0
      jest.spyOn(registry, 'getMotionCueImplementation').mockReturnValue(m1)
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue')
      jest.spyOn(registry, 'findAudioMotionCueRef').mockReturnValue({ groupId: GROUP, cueId: 'm1' })

      const handler = buildHandler()
      handler.setManualMotionRef({ groupId: GROUP, cueId: 'm1' })
      randomSpy.mockReturnValue(0.99)

      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, false)

      expect(m1.execute).toHaveBeenCalled()
      expect(randSpy).not.toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).not.toHaveBeenCalled()
    })

    it('picks when Math.random < probability/100, clears when >=', async () => {
      probability = 50
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(m1)
      jest.spyOn(registry, 'findAudioMotionCueRef').mockReturnValue({ groupId: GROUP, cueId: 'm1' })

      const handler = buildHandler()

      randomSpy.mockReturnValue(0.49)
      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, false)
      expect(randSpy).toHaveBeenCalledTimes(1)
      expect(m1.execute).toHaveBeenCalled()

      randSpy.mockClear()
      ;(sequencer.schedulePanTiltClear as jest.Mock).mockClear()

      randomSpy.mockReturnValue(0.5)
      await handler.handleAudioData(minimalAudioData(), audioConfig, 'pb', null, null, 0, false)
      expect(randSpy).not.toHaveBeenCalled()
      expect(m1.onStop).toHaveBeenCalled()
      expect(sequencer.schedulePanTiltClear).toHaveBeenCalledTimes(1)
    })
  })
})
