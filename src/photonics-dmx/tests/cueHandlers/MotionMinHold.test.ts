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

function makeMotionNet(id: string, execute: jest.Mock<() => Promise<void>>): INetCue {
  return {
    id,
    cueId: CueType.Menu,
    description: 'm',
    style: CueStyle.Primary,
    execute,
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

describe('motion cue minimum hold', () => {
  const mockCueData: CueData = {
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

  describe('YargCueHandler', () => {
    let registry: YargCueRegistry
    let lightManager: DmxLightManager
    let sequencer: ILightingController
    let handler: YargCueHandler
    let nowSpy: jest.SpiedFunction<() => number>

    beforeEach(() => {
      registry = YargCueRegistry.getInstance()
      registry.reset()
      const def = new MockPrimary(CueType.Default)
      const verse = new MockPrimary(CueType.Verse)
      const chorus = new MockPrimary(CueType.Chorus)
      const execM1 = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const motionM1 = makeMotionNet('m1-inst', execM1)
      const mockDefaultGroup: ICueGroup = {
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
      registry.registerGroup(mockDefaultGroup)
      registry.setDefaultGroup(mockDefaultGroup.id)
      registry.activateGroup(mockDefaultGroup.id)
      registry.setEnabledMotionGroups([mockDefaultGroup.id])

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

      handler = new YargCueHandler(lightManager, sequencer, {
        getMotionCueMinimumHoldMs: () => 10_000,
      })
      handler.setMotionEnabled(true)
      nowSpy = jest.spyOn(Date, 'now')
      nowSpy.mockReturnValue(1_000_000)
    })

    afterEach(() => {
      nowSpy.mockRestore()
      registry.reset()
    })

    it('skips auto motion re-pick when lighting cue changes within min hold', async () => {
      const execA = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const execB = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const motionA = makeMotionNet('ma', execA)
      const motionB = makeMotionNet('mb', execB)
      let pick = 0
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockImplementation(() => {
        pick += 1
        return pick === 1 ? motionA : motionB
      })
      jest.spyOn(registry, 'findYargMotionCueRef').mockReturnValue({ groupId: 'g', cueId: 'm' })

      try {
        await handler.handleCue(CueType.Default, mockCueData)
        await handler.handleCue(CueType.Verse, mockCueData)
        expect(randSpy).toHaveBeenCalledTimes(1)
        expect(execA).toHaveBeenCalledTimes(2)
        expect(execB).not.toHaveBeenCalled()

        nowSpy.mockReturnValue(1_020_000)
        const chorusCue = registry.getCueImplementation(CueType.Chorus, 'tracked')
        const ch = chorusCue as MockPrimary
        await handler.handleCue(CueType.Chorus, mockCueData)
        expect(randSpy).toHaveBeenCalledTimes(2)
        expect(execB).toHaveBeenCalledTimes(1)
        expect(ch.executeMock).toHaveBeenCalled()
      } finally {
        randSpy.mockRestore()
      }
    })

    it('applies manual motion change immediately regardless of min hold', async () => {
      const execRand = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const motionRand = makeMotionNet('rand', execRand)
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motionRand)
      const implSpy = jest.spyOn(registry, 'getMotionCueImplementation')
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'x' })

      try {
        await handler.handleCue(CueType.Default, mockCueData)
        expect(randSpy).toHaveBeenCalledTimes(1)

        handler.setManualMotionRef({ groupId: 'mock-default', cueId: 'm1' })
        await handler.handleCue(CueType.Verse, mockCueData)
        expect(implSpy).toHaveBeenCalledWith({ groupId: 'mock-default', cueId: 'm1' })
      } finally {
        implSpy.mockRestore()
        randSpy.mockRestore()
      }
    })

    it('after manual motion pick, auto re-pick stays gated until min hold elapses', async () => {
      const execRand = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const motionRand = makeMotionNet('rand', execRand)
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motionRand)
      const implSpy = jest.spyOn(registry, 'getMotionCueImplementation')
      jest
        .spyOn(registry, 'findYargMotionCueRef')
        .mockReturnValue({ groupId: 'mock-default', cueId: 'x' })

      try {
        await handler.handleCue(CueType.Default, mockCueData)
        expect(randSpy).toHaveBeenCalledTimes(1)

        handler.setManualMotionRef({ groupId: 'mock-default', cueId: 'm1' })
        await handler.handleCue(CueType.Verse, mockCueData)
        expect(implSpy).toHaveBeenCalledWith({ groupId: 'mock-default', cueId: 'm1' })

        await handler.handleCue(CueType.Chorus, mockCueData)
        expect(randSpy).toHaveBeenCalledTimes(1)
      } finally {
        implSpy.mockRestore()
        randSpy.mockRestore()
      }
    })
  })

  describe('AudioCueHandler', () => {
    const GROUP = 'min-hold-audio'
    let registry: AudioCueRegistry
    let lightManager: DmxLightManager
    let sequencer: ILightingController
    let handler: AudioCueHandler
    let audioConfig: AudioConfig
    let nowSpy: jest.SpiedFunction<() => number>

    beforeEach(() => {
      registry = AudioCueRegistry.getInstance()
      registry.reset()
      const primaryA = makeMotionAudio('pa')
      const primaryB = makeMotionAudio('pb')
      const primaryC = makeMotionAudio('pc')
      const m1 = makeMotionAudio('m1')
      const m2 = makeMotionAudio('m2')
      registry.registerGroup({
        id: GROUP,
        name: 'T',
        description: '',
        cues: new Map<AudioCueType, IAudioCue>([
          ['pa', primaryA],
          ['pb', primaryB],
          ['pc', primaryC],
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
        onBeat: jest.fn(),
      } as unknown as ILightingController

      handler = new AudioCueHandler(lightManager, sequencer, {
        getMotionCueMinimumHoldMs: () => 10_000,
      })
      audioConfig = { ...DEFAULT_AUDIO_CONFIG }
      nowSpy = jest.spyOn(Date, 'now')
      nowSpy.mockReturnValue(2_000_000)
    })

    afterEach(() => {
      nowSpy.mockRestore()
      registry.reset()
    })

    it('skips auto motion re-pick when primary changes within min hold (non game mode)', async () => {
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue')
      let pick = 0
      randSpy.mockImplementation(() => {
        pick += 1
        return pick === 1
          ? registry.getGroup(GROUP)!.motionCues!.get('m1')!
          : registry.getGroup(GROUP)!.motionCues!.get('m2')!
      })

      try {
        await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, false)
        await handler.handleAudioData(minimalAudioData(), audioConfig, 'pb', null, null, 0, false)
        expect(randSpy).toHaveBeenCalledTimes(1)

        nowSpy.mockReturnValue(2_020_000)
        await handler.handleAudioData(minimalAudioData(), audioConfig, 'pc', null, null, 0, false)
        expect(randSpy).toHaveBeenCalledTimes(2)
      } finally {
        randSpy.mockRestore()
      }
    })

    it('allows motion re-pick on every primary change when game mode is active', async () => {
      const randSpy = jest.spyOn(registry, 'getRandomMotionCue')
      let pick = 0
      randSpy.mockImplementation(() => {
        pick += 1
        return pick === 1
          ? registry.getGroup(GROUP)!.motionCues!.get('m1')!
          : registry.getGroup(GROUP)!.motionCues!.get('m2')!
      })
      try {
        await handler.handleAudioData(minimalAudioData(), audioConfig, 'pa', null, null, 0, true)
        await handler.handleAudioData(minimalAudioData(), audioConfig, 'pb', null, null, 0, true)
        expect(randSpy).toHaveBeenCalledTimes(2)
      } finally {
        randSpy.mockRestore()
      }
    })
  })
})
