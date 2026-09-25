/**
 * What the calibration wizard writes to the console the moment it opens.
 */
import { describe, expect, it } from '@jest/globals'
import {
  FixtureTypes,
  normalizeFixtureConfig,
  type ExtraChannel,
  type RgbMovingHeadLight,
} from '../../../photonics-dmx/types'
import { buildInitialConsoleBuffer } from './movingHeadCalibrationBuffer'

function movingHead(overrides: Partial<RgbMovingHeadLight> = {}): RgbMovingHeadLight {
  return {
    id: 'l1',
    fixtureId: 't1',
    position: 1,
    fixture: FixtureTypes.RGBMH,
    label: 'MH',
    name: 'MH',
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels: {
      masterDimmer: 1,
      red: 2,
      green: 3,
      blue: 4,
      pan: 5,
      tilt: 6,
      strobeChannel: 7,
    },
    ...overrides,
  }
}

describe('buildInitialConsoleBuffer', () => {
  it('opens the dimmer and every colour so the beam can be seen', () => {
    const buffer = buildInitialConsoleBuffer(movingHead())

    expect(buffer[1]).toBe(255)
    expect(buffer[2]).toBe(255)
    expect(buffer[3]).toBe(255)
    expect(buffer[4]).toBe(255)
  })

  it('parks every other channel dark', () => {
    const buffer = buildInitialConsoleBuffer(movingHead())

    expect(buffer[7]).toBe(0)
  })

  it('points pan and tilt at the configured home', () => {
    const buffer = buildInitialConsoleBuffer(
      movingHead({ config: normalizeFixtureConfig({ panHome: 50, panMin: 40, panMax: 240 }) }),
    )

    // Home is a percentage of the motor travel, so halfway between 40 and 240.
    expect(buffer[5]).toBe(140)
  })

  it('mirrors pan when the fixture is inverted', () => {
    const upright = buildInitialConsoleBuffer(
      movingHead({ config: normalizeFixtureConfig({ panHome: 25, panMin: 0, panMax: 100 }) }),
    )
    const inverted = buildInitialConsoleBuffer(
      movingHead({
        config: normalizeFixtureConfig({ panHome: 25, panMin: 0, panMax: 100, invertPan: true }),
      }),
    )

    expect(inverted[5]).not.toBe(upright[5])
  })

  it('mirrors tilt on its own inversion rather than the pan one', () => {
    const buffer = buildInitialConsoleBuffer(
      movingHead({
        config: normalizeFixtureConfig({
          panHome: 25,
          panMin: 0,
          panMax: 100,
          tiltHome: 25,
          tiltMin: 0,
          tiltMax: 100,
          invertTilt: true,
        }),
      }),
    )
    const upright = buildInitialConsoleBuffer(
      movingHead({
        config: normalizeFixtureConfig({
          panHome: 25,
          panMin: 0,
          panMax: 100,
          tiltHome: 25,
          tiltMin: 0,
          tiltMax: 100,
        }),
      }),
    )

    expect(buffer[5]).toBe(upright[5])
    expect(buffer[6]).not.toBe(upright[6])
  })

  it('skips a channel outside the universe', () => {
    const buffer = buildInitialConsoleBuffer(
      movingHead({ channels: { ...movingHead().channels, red: 0, green: 900 } }),
    )

    expect(buffer[0]).toBeUndefined()
    expect(buffer[900]).toBeUndefined()
    expect(buffer[1]).toBe(255)
  })
})

describe('buildInitialConsoleBuffer extra channels', () => {
  const extras = (list: ExtraChannel[]): RgbMovingHeadLight => movingHead({ extraChannels: list })

  it('holds a pinned channel at its value so the fixture lights at all', () => {
    const buffer = buildInitialConsoleBuffer(extras([{ type: 'fixed', channel: 20, value: 200 }]))

    expect(buffer[20]).toBe(200)
  })

  it('holds a pinned value inside the DMX range', () => {
    const buffer = buildInitialConsoleBuffer(
      extras([
        { type: 'fixed', channel: 20, value: 900 },
        { type: 'fixed', channel: 21, value: -5 },
      ]),
    )

    expect(buffer[20]).toBe(255)
    expect(buffer[21]).toBe(0)
  })

  it('reads a pinned channel with no value as dark', () => {
    const buffer = buildInitialConsoleBuffer(extras([{ type: 'fixed', channel: 20 }]))

    expect(buffer[20]).toBe(0)
  })

  it('parks a colour extra dark', () => {
    const buffer = buildInitialConsoleBuffer(extras([{ type: 'white', channel: 20, value: 255 }]))

    expect(buffer[20]).toBe(0)
  })

  it('skips an extra outside the universe', () => {
    const buffer = buildInitialConsoleBuffer(extras([{ type: 'fixed', channel: 700, value: 10 }]))

    expect(buffer[700]).toBeUndefined()
  })
})
