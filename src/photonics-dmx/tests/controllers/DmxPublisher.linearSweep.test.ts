import { describe, expect, it } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { fakeSenderManager } from '../helpers/fakeSenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  FixtureTypes,
  type DmxRig,
  type FixtureConfig,
  type LightingConfiguration,
  type RGBIO,
} from '../../types'
import { sweepFrames, userRigFixture } from '../helpers/linearSweep'

const PAN_CHANNEL = 5
const TILT_CHANNEL = 6

function makeMovingHeadRig(config: FixtureConfig): DmxRig {
  const lightingConfig: LightingConfiguration = {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: 'none' as LightingConfiguration['strobeType'],
    frontLights: [
      {
        id: 'mh-1',
        fixtureId: 'mh-fixture-1',
        name: 'MH 1',
        label: 'MH 1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: FixtureTypes.RGBMH,
        group: 'front',
        position: 1,
        channels: {
          red: 1,
          green: 2,
          blue: 3,
          masterDimmer: 4,
          pan: PAN_CHANNEL,
          tilt: TILT_CHANNEL,
        },
        config,
      },
    ],
    backLights: [],
    strobeLights: [],
  }
  return { id: 'rig', name: 'rig', active: true, config: lightingConfig }
}

/** The universe buffer one published frame puts on the wire. */
function publishFrame(rig: DmxRig, pan: number, tilt: number): Record<number, number> {
  const sender = fakeSenderManager()
  const { send } = sender
  const publisher = new DmxPublisher(sender, new LightStateManager())
  publisher.updateActiveRigs([rig])
  const state: RGBIO = {
    red: 255,
    green: 0,
    blue: 0,
    intensity: 255,
    opacity: 1,
    blendMode: 'replace',
    pan,
    tilt,
  }
  publisher.publish(new Map([['mh-1', state]]))
  const [, buffer] = send.mock.calls[0]
  return buffer
}

describe.each([
  ['default fixture', DEFAULT_MOVING_HEAD_FIXTURE_CONFIG as FixtureConfig],
  ['user rig', userRigFixture],
])('vertical linear sweep on the wire for the %s', (_label, config) => {
  it('keeps the pan byte constant while the tilt byte moves', () => {
    const rig = makeMovingHeadRig(config)
    const buffers = sweepFrames(config, 'vertical').map((frame) =>
      publishFrame(rig, frame.pan, frame.tilt),
    )

    const panBytes = new Set(buffers.map((buffer) => buffer[PAN_CHANNEL]))
    const tiltBytes = new Set(buffers.map((buffer) => buffer[TILT_CHANNEL]))
    expect(panBytes.size).toBe(1)
    expect(tiltBytes.size).toBeGreaterThanOrEqual(3)
  })
})
