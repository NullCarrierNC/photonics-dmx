import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { performance } from 'perf_hooks'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { getColor } from '../../helpers/dmxHelpers'
import { Effect } from '../../types'
import { Clock } from '../../controllers/sequencer/Clock'
import { DrumNoteType } from '../../cues'

type SequencerHarness = {
  sequencer: Sequencer
  lightStateManager: LightStateManager
  advanceBy: (ms: number) => void
  cleanup: () => void
}

function createSequencerHarness(): SequencerHarness {
  const clock = new ManualTestClock()
  const lightStateManager = new LightStateManager()
  const lightTransitionController = new LightTransitionController(lightStateManager)
  const performanceSpy = jest
    .spyOn(performance, 'now')
    .mockImplementation(() => clock.getCurrentTimeMs())
  const sequencer = new Sequencer(lightTransitionController, clock as unknown as Clock)

  return {
    sequencer,
    lightStateManager,
    advanceBy: (ms: number) => clock.tick(ms),
    cleanup: () => {
      sequencer.shutdown()
      performanceSpy.mockRestore()
    },
  }
}

function createStageKitLightManager() {
  const frontLights = Array.from({ length: 4 }, (_, index) =>
    createMockDmxLight({
      id: `front-${index + 1}`,
      position: index + 1,
    }),
  )

  const backLights = Array.from({ length: 4 }, (_, index) =>
    createMockDmxLight({
      id: `back-${index + 1}`,
      position: frontLights.length + index + 1,
    }),
  )

  const config = createMockLightingConfig({
    frontLights,
    backLights,
  })

  const manager = new DmxLightManager(config)
  const allLightIds = manager.getLights(['front', 'back'], ['all']).map((light) => light.id)
  return { manager, allLightIds }
}

describe('Sequencer integration lighting tests', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness()
  })

  afterEach(() => {
    harness.cleanup()
  })

  describe('event-gated transitions (beat/measure/drums)', () => {
    const eventCases: Array<{
      label: string
      waitCondition: Effect['transitions'][number]['waitForCondition']
      trigger: (seq: Sequencer) => void
    }> = [
      {
        label: 'beat',
        waitCondition: 'beat',
        trigger: (seq) => seq.onBeat(),
      },
      {
        label: 'measure',
        waitCondition: 'measure',
        trigger: (seq) => seq.onMeasure(),
      },
      {
        label: 'drum-red',
        waitCondition: 'drum-red',
        trigger: (seq) => seq.onDrumNote(DrumNoteType.RedDrum),
      },
    ]

    for (const testCase of eventCases) {
      it(`responds to ${testCase.label} events`, () => {
        const { manager } = createStageKitLightManager()
        const trackedLights = manager.getLights(['front'], ['all'])
        const targetLight = trackedLights[0]
        const activeColor = getColor('red', 'high')

        const effect: Effect = {
          id: `event-${testCase.label}`,
          description: 'Event gated effect',
          transitions: [
            {
              lights: [targetLight],
              layer: 0,
              waitForCondition: testCase.waitCondition,
              waitForTime: 0,
              transform: {
                color: activeColor,
                easing: 'linear',
                duration: 0,
              },
              waitUntilCondition: 'none',
              waitUntilTime: 0,
            },
          ],
        }

        harness.sequencer.addEffect(`event-${testCase.label}`, effect, false)

        // Before event, state should stay at default black
        harness.advanceBy(1)
        let state = harness.lightStateManager.getLightState(targetLight.id)
        expect(state?.intensity ?? 0).toBe(0)

        testCase.trigger(harness.sequencer)
        harness.advanceBy(1)

        state = harness.lightStateManager.getLightState(targetLight.id)
        expect(state).toMatchObject({
          red: activeColor.red,
          green: activeColor.green,
          blue: activeColor.blue,
          blendMode: activeColor.blendMode,
        })
      })
    }
  })
})
