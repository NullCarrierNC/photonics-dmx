import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { CueRuntime } from '../../cueHandlers/CueRuntime'
import { CueType } from '../../cues/types/cueTypes'
import type { CueData } from '../../cues/types/cueTypes'
import { getColor } from '../../helpers/dmxHelpers'
import { Rb3RightChannel } from '../../listeners/RB3/rb3eTypes'
import { Rb3StageKitCueProcessor } from '../../processors/Rb3StageKitCueProcessor'
import { createRb3StreamHarness, type Rb3StreamHarness } from '../helpers/rb3StreamHarness'

const ALL_LEDS = 0xff
const LIGHTS = [0, 1, 2, 3, 4, 5, 6, 7]

function recordingRuntime(frames: CueData[]): CueRuntime {
  return {
    notifySongStart: jest.fn(),
    notifySongEnd: jest.fn(),
    handleBeat: jest.fn(),
    handleMeasure: jest.fn(),
    handleKeyframeFirst: jest.fn(),
    handleKeyframeNext: jest.fn(),
    handleKeyframePrevious: jest.fn(),
    handleCue: async (cueType: CueType, frame: CueData) => {
      if (cueType === CueType.RB3) frames.push(frame)
    },
    handleDrumNote: jest.fn(),
    handleGuitarNote: jest.fn(),
    handleBassNote: jest.fn(),
    handleKeysNote: jest.fn(),
    handleVocalNote: jest.fn(),
    stopActiveStrobe: jest.fn(),
    resetSessionState: jest.fn(),
  }
}

interface Row {
  build: () => { harness: Rb3StreamHarness; teardown: () => void }
  /** Whether the rig shows the gameplay red bank rather than the menu look. */
  showsGameplay: (harness: Rb3StreamHarness) => boolean
}

const stageKitRed = getColor('red', 'medium')

// The recording runtime renders nothing, so cue mode shows the red bank as a dispatched RB3 frame.
const cueFrames: CueData[] = []

const rows: Array<[string, Row]> = [
  [
    'direct',
    {
      build: () => {
        const harness = createRb3StreamHarness()
        return { harness, teardown: () => harness.cleanup() }
      },
      showsGameplay: (harness) =>
        LIGHTS.every((i) => {
          const level = harness.wireLevel(i)
          return (
            level !== null &&
            level.red === stageKitRed.red &&
            level.green === 0 &&
            level.blue === 0 &&
            level.dimmer === stageKitRed.intensity
          )
        }),
    },
  ],
  [
    'cue',
    {
      build: () => {
        cueFrames.length = 0
        const harness = createRb3StreamHarness({ directProcessor: false })
        const processor = new Rb3StageKitCueProcessor(recordingRuntime(cueFrames), {
          keepaliveMs: null,
          menuDispatch: harness.fanout,
        })
        processor.startListening(harness.listener)
        return {
          harness,
          teardown: () => {
            processor.destroy()
            harness.cleanup()
          },
        }
      },
      showsGameplay: () => cueFrames[cueFrames.length - 1]?.ledBanks?.red === ALL_LEDS,
    },
  ],
]

describe('an RB3 gameplay packet under the menu look', () => {
  let teardown: (() => void) | null = null
  afterEach(() => {
    teardown?.()
    teardown = null
  })

  it.each(rows)(
    '%s mode leaves the menu look for the song on a lit bank',
    async (_mode, row) => {
      const built = row.build()
      teardown = built.teardown
      const h = built.harness

      h.gameState('Menus')
      await h.step(1100)
      const menuFramesBefore = h.menuFrames()
      expect(menuFramesBefore).toBeGreaterThan(0)

      h.stageKit(ALL_LEDS, Rb3RightChannel.RedLeds)
      await h.step(10)
      expect(row.showsGameplay(h)).toBe(true)

      let menuLookSamples = 0
      await h.step(4000, () => {
        if (!row.showsGameplay(h)) menuLookSamples++
      })
      expect(h.menuFrames()).toBe(menuFramesBefore)
      expect(menuLookSamples).toBe(0)
    },
    15000,
  )
})
