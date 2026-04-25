import {
  motorDegFromPanDmx,
  motorDegFromTiltDmx,
  rawDmxToLogicalHomePercent,
} from '../../helpers/movingHeadCalibration'
import { clampMergeMovingHeadFixtureConfig, normalizeFixtureConfig } from '../../types'

describe('motorDegFromPanDmx / motorDegFromTiltDmx', () => {
  const cfg = normalizeFixtureConfig({
    panMin: 0,
    panMax: 255,
    panRangeDeg: 540,
    tiltMin: 0,
    tiltMax: 255,
    tiltRangeDeg: 180,
  })

  it('maps minimum DMX to 0° pan', () => {
    expect(motorDegFromPanDmx(0, cfg)).toBe(0)
  })

  it('maps maximum DMX to full pan range', () => {
    expect(motorDegFromPanDmx(255, cfg)).toBe(540)
  })

  it('maps mid DMX to half pan range', () => {
    expect(motorDegFromPanDmx(127, cfg)).toBeCloseTo((127 / 255) * 540, 0)
  })

  it('maps tilt DMX across tilt range', () => {
    expect(motorDegFromTiltDmx(0, cfg)).toBe(0)
    expect(motorDegFromTiltDmx(255, cfg)).toBe(180)
  })

  it('captures inverted pan in logical mirrored space', () => {
    const inverted = normalizeFixtureConfig({
      panRangeDeg: 540,
      panHome: 0,
      invertPan: true,
    })
    expect(motorDegFromPanDmx(0, inverted)).toBeCloseTo(540, 5)
    expect(motorDegFromPanDmx(255, inverted)).toBeCloseTo(0, 5)
  })

  it('captures inverted tilt in logical mirrored space', () => {
    const inverted = normalizeFixtureConfig({
      tiltRangeDeg: 180,
      tiltHome: 0,
      invertTilt: true,
    })
    expect(motorDegFromTiltDmx(0, inverted)).toBeCloseTo(180, 5)
    expect(motorDegFromTiltDmx(255, inverted)).toBeCloseTo(0, 5)
  })
})

describe('rawDmxToLogicalHomePercent', () => {
  it('returns dmxToPercent directly for non-inverted axis', () => {
    expect(rawDmxToLogicalHomePercent(0, 0, 255, false)).toBe(0)
    expect(rawDmxToLogicalHomePercent(128, 0, 255, false)).toBeCloseTo(50.2, 0)
    expect(rawDmxToLogicalHomePercent(255, 0, 255, false)).toBe(100)
  })

  it('mirrors edge DMX for inverted axis at min', () => {
    const result = rawDmxToLogicalHomePercent(0, 0, 255, true)
    expect(result).toBe(100)
  })

  it('mirrors edge DMX for inverted axis at max', () => {
    const result = rawDmxToLogicalHomePercent(255, 0, 255, true)
    expect(result).toBe(0)
  })

  it('mirrors mid DMX for inverted axis (end-for-end)', () => {
    const result = rawDmxToLogicalHomePercent(128, 0, 255, true)
    expect(result).toBeCloseTo((127 / 255) * 100, 0)
  })
})

describe('clampMergeMovingHeadFixtureConfig', () => {
  const base = normalizeFixtureConfig({
    panRangeDeg: 540,
    tiltRangeDeg: 180,
    panStageDeg: 270,
    tiltStageDeg: 90,
  })

  it('clamps pan and tilt stage references to merged ranges', () => {
    const merged = clampMergeMovingHeadFixtureConfig(base, {
      panRangeDeg: 400,
      tiltRangeDeg: 90,
      panStageDeg: 999,
      tiltStageDeg: 999,
    })
    expect(merged.panRangeDeg).toBe(400)
    expect(merged.tiltRangeDeg).toBe(90)
    expect(merged.panStageDeg).toBe(400)
    expect(merged.tiltStageDeg).toBe(90)
  })

  it('clamps degree ranges to UI limits', () => {
    const merged = clampMergeMovingHeadFixtureConfig(base, {
      panRangeDeg: 9000,
      tiltRangeDeg: 400,
    })
    expect(merged.panRangeDeg).toBe(720)
    expect(merged.tiltRangeDeg).toBe(360)
  })

  it('merges boolean patch fields', () => {
    const merged = clampMergeMovingHeadFixtureConfig(base, {
      panDirectionCW: false,
      invertPan: true,
      invertTilt: true,
    })
    expect(merged.panDirectionCW).toBe(false)
    expect(merged.invertPan).toBe(true)
    expect(merged.invertTilt).toBe(true)
  })
})
