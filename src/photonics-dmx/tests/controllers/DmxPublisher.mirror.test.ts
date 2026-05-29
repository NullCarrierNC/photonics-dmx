/**
 * DmxPublisher rig-level mirror tests.
 *
 * `rig.mirrorHoriz` inverts cue-driven pan around the fixture's calibrated home before
 * percent → DMX, completing the position-based mirror feature for moving-head choreography
 * (e.g. a CW circle cue plays CCW on a Horiz-mirrored rig). Verified in isolation here:
 *
 *  - Cue-driven pan is mirrored when `mirrorHoriz === true`.
 *  - Idle home fallback (pan == null) is NOT mirrored — calibration is preserved.
 *  - Tilt is never touched by Horiz mirror.
 *  - `mirrorVert` does not invert pan or tilt — it's row-swap only at the position layer.
 *  - Composes with per-fixture `cfg.invertPan` (hardware mounting correction).
 *  - Non-moving-head fixtures are unaffected.
 *  - Per-rig isolation: one rig mirrored, one not → distinct outputs in the same publisher.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import type { DmxRig, FixtureConfig, LightingConfiguration, RGBIO } from '../../types'
import { FixtureTypes } from '../../types'
import {
  mirrorDmxForMovingHeadInvert,
  mirrorPercentAroundHome,
  percentToDmx,
} from '../../helpers/dmxHelpers'

function makeMockSenderManager(): {
  send: ReturnType<typeof jest.fn>
  getEnabledWireSenders: ReturnType<typeof jest.fn>
  isIpcEnabled: ReturnType<typeof jest.fn>
} {
  return {
    send: jest.fn().mockImplementation(() => Promise.resolve()),
    getEnabledWireSenders: jest.fn(() => ['sacn']),
    isIpcEnabled: jest.fn(() => false),
  }
}

function makeMhRig(
  rigId: string,
  fixtureConfig: Partial<FixtureConfig>,
  rigOverrides: Partial<DmxRig> = {},
  channelBase = 0,
): DmxRig {
  const cfg: FixtureConfig = {
    panHome: 50,
    panMin: 0,
    panMax: 255,
    panRangeDeg: 540,
    panDirectionCW: true,
    panStageDeg: 270,
    tiltHome: 50,
    tiltMin: 0,
    tiltMax: 255,
    tiltRangeDeg: 180,
    tiltStageDeg: 90,
    invertPan: false,
    invertTilt: false,
    ...fixtureConfig,
  }
  const lightingConfig: LightingConfiguration = {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: 'none' as import('../../types').ConfigStrobeType,
    frontLights: [
      {
        id: `${rigId}-mh-1`,
        fixtureId: 'mh-fixture-1',
        name: 'MH 1',
        label: 'MH 1',
        isStrobeEnabled: false,
        universe: 1,
        fixture: FixtureTypes.RGBMH,
        group: 'front',
        position: 1,
        channels: {
          red: channelBase + 1,
          green: channelBase + 2,
          blue: channelBase + 3,
          masterDimmer: channelBase + 4,
          pan: channelBase + 5,
          tilt: channelBase + 6,
        },
        config: cfg,
      },
    ],
    backLights: [],
    strobeLights: [],
  }
  return { id: rigId, name: rigId, active: true, config: lightingConfig, ...rigOverrides }
}

function rgbio(values: Partial<RGBIO>): RGBIO {
  return {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 0,
    opacity: 1,
    blendMode: 'replace',
    ...values,
  }
}

function publishOne(rig: DmxRig, lightId: string, value: RGBIO): Record<number, number> {
  const sender = makeMockSenderManager()
  const lsm = new LightStateManager()
  const pub = new DmxPublisher(sender as unknown as SenderManager, lsm)
  pub.updateActiveRigs([rig])
  const lights = new Map<string, RGBIO>()
  lights.set(lightId, value)
  pub.publish(lights)
  const [, buffer] = jest.mocked(sender.send).mock.calls[0]
  return buffer as Record<number, number>
}

describe('DmxPublisher — rig Horiz mirror', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('inverts cue pan around fixture home (symmetric home=50%)', () => {
    const rig = makeMhRig('rig-mirrored', { panHome: 50 }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({ pan: 25, tilt: 50 }))
    // pan 25 mirrors around home 50 → 75; percentToDmx(75, 0, 255).
    expect(buf[5]).toBe(percentToDmx(75, 0, 255))
  })

  it('inverts cue pan around an asymmetric fixture home (40%)', () => {
    const rig = makeMhRig('rig-mirrored', { panHome: 40 }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({ pan: 25, tilt: 50 }))
    // 2*40 - 25 = 55.
    expect(buf[5]).toBe(percentToDmx(55, 0, 255))
  })

  it('does not touch tilt — Horiz is the left/right axis only', () => {
    const rig = makeMhRig('rig-mirrored', { tiltHome: 50 }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({ pan: 50, tilt: 30 }))
    expect(buf[6]).toBe(percentToDmx(30, 0, 255))
  })

  it('does not affect the idle-home fallback when cue pan is null', () => {
    // pan/tilt omitted (== undefined / null path inside publisher).
    const rig = makeMhRig('rig-mirrored', { panHome: 40 }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({}))
    // Should be plain percentToDmx(40, ...) — NOT the mirror around home.
    expect(buf[5]).toBe(percentToDmx(40, 0, 255))
  })

  it('leaves cue pan unchanged when mirrorHoriz is absent (no mirror)', () => {
    const rig = makeMhRig('rig-unmirrored', { panHome: 50 })
    const buf = publishOne(rig, 'rig-unmirrored-mh-1', rgbio({ pan: 25, tilt: 50 }))
    expect(buf[5]).toBe(percentToDmx(25, 0, 255))
  })

  it('composes with cfg.invertPan: rig mirror at percent, fixture invert at DMX', () => {
    const rig = makeMhRig('rig-mirrored', { panHome: 50, invertPan: true }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({ pan: 25, tilt: 50 }))
    // 1) rig mirror around home: 25 → 75 (percent).
    // 2) percent → DMX: percentToDmx(75, 0, 255).
    // 3) fixture invertPan applies mirrorDmxForMovingHeadInvert at DMX layer.
    const step1 = mirrorPercentAroundHome(25, 50)
    const step2 = percentToDmx(step1, 0, 255)
    const step3 = mirrorDmxForMovingHeadInvert(step2, 0, 255)
    expect(buf[5]).toBe(step3)
  })

  it('clamps when mirror around home pushes out of [0,100]', () => {
    // home=80, pan=10 → 2*80 - 10 = 150 → clamped to 100. percentToDmx(100, ...) = panMax.
    const rig = makeMhRig('rig-mirrored', { panHome: 80 }, { mirrorHoriz: true })
    const buf = publishOne(rig, 'rig-mirrored-mh-1', rgbio({ pan: 10, tilt: 50 }))
    expect(buf[5]).toBe(255)
  })
})

describe('DmxPublisher — rig Vert mirror', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not invert tilt — Vert is row-swap only at the position layer', () => {
    const rig = makeMhRig('rig-vert', { tiltHome: 50 }, { mirrorVert: true })
    const buf = publishOne(rig, 'rig-vert-mh-1', rgbio({ pan: 50, tilt: 30 }))
    expect(buf[6]).toBe(percentToDmx(30, 0, 255))
  })

  it('does not invert pan', () => {
    const rig = makeMhRig('rig-vert', { panHome: 50 }, { mirrorVert: true })
    const buf = publishOne(rig, 'rig-vert-mh-1', rgbio({ pan: 25, tilt: 50 }))
    expect(buf[5]).toBe(percentToDmx(25, 0, 255))
  })
})

describe('DmxPublisher — mirror is per-rig isolated', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('two rigs with the same cue pan emit different DMX when only one is Horiz-mirrored', () => {
    // Channel-base offsets keep the two rigs' fixtures on non-overlapping wire channels so we
    // can assert each rig's pan independently in the merged sACN buffer.
    const sender = makeMockSenderManager()
    const lsm = new LightStateManager()
    const pub = new DmxPublisher(sender as unknown as SenderManager, lsm)

    const mirroredRig = makeMhRig('rig-mirrored', { panHome: 50 }, { mirrorHoriz: true }, 0)
    const plainRig = makeMhRig('rig-plain', { panHome: 50 }, {}, 100)
    pub.updateActiveRigs([mirroredRig, plainRig])

    const lights = new Map<string, RGBIO>()
    lights.set('rig-mirrored-mh-1', rgbio({ pan: 25, tilt: 50 }))
    lights.set('rig-plain-mh-1', rgbio({ pan: 25, tilt: 50 }))
    pub.publish(lights)

    const [, buf] = jest.mocked(sender.send).mock.calls[0]
    const bufRecord = buf as Record<number, number>
    // Mirrored rig: pan 25 → 75 → DMX. Plain rig: pan 25 → DMX directly.
    expect(bufRecord[5]).toBe(percentToDmx(75, 0, 255))
    expect(bufRecord[105]).toBe(percentToDmx(25, 0, 255))
  })
})

describe('DmxPublisher — mirror does not affect non-moving-head fixtures', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('plain RGB fixture in a Horiz-mirrored rig produces unmirrored channel output', () => {
    const sender = makeMockSenderManager()
    const lsm = new LightStateManager()
    const pub = new DmxPublisher(sender as unknown as SenderManager, lsm)

    const lightingConfig: LightingConfiguration = {
      numLights: 1,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: 'none' as import('../../types').ConfigStrobeType,
      frontLights: [
        {
          id: 'rgb-1',
          fixtureId: 'rgb-fixture-1',
          name: 'RGB 1',
          label: 'RGB 1',
          isStrobeEnabled: false,
          universe: 1,
          fixture: FixtureTypes.RGB,
          group: 'front',
          position: 1,
          channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
        },
      ],
      backLights: [],
      strobeLights: [],
    }
    const rig: DmxRig = {
      id: 'rgb-mirrored',
      name: 'RGB Mirrored',
      active: true,
      config: lightingConfig,
      mirrorHoriz: true,
    }
    pub.updateActiveRigs([rig])
    const lights = new Map<string, RGBIO>()
    lights.set('rgb-1', rgbio({ red: 200, green: 100, blue: 50, intensity: 255 }))
    pub.publish(lights)

    const [, buf] = jest.mocked(sender.send).mock.calls[0]
    const bufRecord = buf as Record<number, number>
    expect(bufRecord[1]).toBe(200)
    expect(bufRecord[2]).toBe(100)
    expect(bufRecord[3]).toBe(50)
    expect(bufRecord[4]).toBe(255)
  })
})
