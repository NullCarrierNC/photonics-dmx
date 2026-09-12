import { describe, expect, it } from '@jest/globals'
import { resolveMovingHeadAxes, StrobePeakLatch } from '../../controllers/publisherLightOutput'
import { DmxFixture, DmxRig, FixtureTypes } from '../../types'

function movingHead(config: Partial<DmxFixture['config']> = {}): DmxFixture {
  return {
    id: 'mh1',
    name: 'MH1',
    label: 'MH1',
    isStrobeEnabled: false,
    universe: 1,
    fixture: FixtureTypes.RGBMH,
    group: 'front',
    position: 1,
    channels: { red: 1, green: 2, blue: 3, masterDimmer: 4, pan: 5, tilt: 6 },
    config: {
      panMin: 0,
      panMax: 540,
      tiltMin: 0,
      tiltMax: 270,
      panHome: 50,
      tiltHome: 50,
      invertPan: false,
      invertTilt: false,
      ...config,
    },
  } as unknown as DmxFixture
}

function rig(overrides: Partial<DmxRig> = {}): DmxRig {
  return { id: 'r1', name: 'R1', active: true, ...overrides } as unknown as DmxRig
}

describe('resolveMovingHeadAxes', () => {
  it('parks at calibrated home when the cue drives neither axis', () => {
    const home = resolveMovingHeadAxes(movingHead(), rig(), null, null)
    const driven = resolveMovingHeadAxes(movingHead(), rig(), 50, 50)

    expect(home).toEqual(driven)
  })

  it('mirrors a driven pan around home for a mirrored rig', () => {
    const light = movingHead({ panHome: 50 })

    const plain = resolveMovingHeadAxes(light, rig(), 65, 50)
    const mirrored = resolveMovingHeadAxes(light, rig({ mirrorHoriz: true }), 65, 50)
    const opposite = resolveMovingHeadAxes(light, rig(), 35, 50)

    expect(mirrored.panOut).toBe(opposite.panOut)
    expect(mirrored.panOut).not.toBe(plain.panOut)
  })

  it('leaves an idle pan alone on a mirrored rig, since home is a calibration', () => {
    const light = movingHead({ panHome: 20 })

    const plain = resolveMovingHeadAxes(light, rig(), null, null)
    const mirrored = resolveMovingHeadAxes(light, rig({ mirrorHoriz: true }), null, null)

    expect(mirrored.panOut).toBe(plain.panOut)
  })

  it('composes the rig mirror with the fixture invert', () => {
    const upright = movingHead({ panHome: 50 })
    const inverted = movingHead({ panHome: 50, invertPan: true })

    const a = resolveMovingHeadAxes(upright, rig({ mirrorHoriz: true }), 70, 50)
    const b = resolveMovingHeadAxes(inverted, rig({ mirrorHoriz: true }), 70, 50)

    expect(a.panOut).not.toBe(b.panOut)
  })

  it('mirrors tilt for an inverted fixture', () => {
    const upright = resolveMovingHeadAxes(movingHead(), rig(), 50, 80)
    const inverted = resolveMovingHeadAxes(movingHead({ invertTilt: true }), rig(), 50, 80)

    expect(inverted.tiltOut).not.toBe(upright.tiltOut)
  })
})

describe('StrobePeakLatch', () => {
  const color = (red: number, green: number, blue: number, intensity: number) => ({
    red,
    green,
    blue,
    intensity,
  })

  it('passes a light through untouched when nothing is latching', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    expect(latch.resolve('l1', false, color(10, 20, 30, 40))).toEqual(color(10, 20, 30, 40))
  })

  it('holds the brightest colour seen while the hardware strobe runs', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    latch.resolve('l1', true, color(255, 0, 0, 255))
    const dip = latch.resolve('l1', true, color(20, 0, 0, 20))

    expect(dip).toEqual(color(255, 0, 0, 255))
  })

  it('takes a new peak when the light gets brighter', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    latch.resolve('l1', true, color(100, 0, 0, 100))
    const brighter = latch.resolve('l1', true, color(200, 0, 0, 200))
    const held = latch.resolve('l1', true, color(10, 0, 0, 10))

    expect(brighter).toEqual(color(200, 0, 0, 200))
    expect(held).toEqual(color(200, 0, 0, 200))
  })

  it('emits a fully dark opening frame as it is rather than latching black', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    expect(latch.resolve('l1', true, color(0, 0, 0, 0))).toEqual(color(0, 0, 0, 0))
    expect(latch.resolve('l1', true, color(90, 0, 0, 90))).toEqual(color(90, 0, 0, 90))
  })

  it('latches a coloured strobe on its primaries, not on intensity alone', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    latch.resolve('l1', true, color(0, 240, 0, 100))
    const dip = latch.resolve('l1', true, color(0, 30, 0, 100))

    expect(dip).toEqual(color(0, 240, 0, 100))
  })

  it('gives up every peak once the strobe ends', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)
    latch.resolve('l1', true, color(255, 0, 0, 255))

    latch.beginFrame(false)
    latch.beginFrame(true)

    expect(latch.resolve('l1', true, color(30, 0, 0, 30))).toEqual(color(30, 0, 0, 30))
  })

  it('keeps each light on its own peak', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    latch.resolve('l1', true, color(255, 0, 0, 255))
    latch.resolve('l2', true, color(0, 0, 80, 80))

    expect(latch.resolve('l1', true, color(1, 0, 0, 1))).toEqual(color(255, 0, 0, 255))
    expect(latch.resolve('l2', true, color(1, 0, 0, 1))).toEqual(color(0, 0, 80, 80))
  })

  it('drops the peak for a light that stops latching', () => {
    const latch = new StrobePeakLatch()
    latch.beginFrame(true)

    latch.resolve('l1', true, color(255, 0, 0, 255))
    latch.resolve('l1', false, color(10, 0, 0, 10))

    expect(latch.resolve('l1', true, color(40, 0, 0, 40))).toEqual(color(40, 0, 0, 40))
  })
})
