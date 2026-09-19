import {
  clampLagCompensationMs,
  LAG_COMPENSATION_MS_MAX,
  normalizeLagCompensationMs,
} from '../../../shared/lagCompensation'

describe('clampLagCompensationMs', () => {
  it('passes a delay inside the window through', () => {
    expect(clampLagCompensationMs(0)).toBe(0)
    expect(clampLagCompensationMs(120)).toBe(120)
    expect(clampLagCompensationMs(LAG_COMPENSATION_MS_MAX)).toBe(LAG_COMPENSATION_MS_MAX)
  })

  it('brings a delay outside the window back into it', () => {
    expect(clampLagCompensationMs(-50)).toBe(0)
    expect(clampLagCompensationMs(9999)).toBe(LAG_COMPENSATION_MS_MAX)
  })

  it('keeps whole milliseconds', () => {
    expect(clampLagCompensationMs(120.4)).toBe(120)
    expect(clampLagCompensationMs(120.6)).toBe(121)
  })
})

describe('normalizeLagCompensationMs', () => {
  it('reads a usable delay', () => {
    expect(normalizeLagCompensationMs(250)).toBe(250)
    expect(normalizeLagCompensationMs(250.6)).toBe(251)
    expect(normalizeLagCompensationMs(9999)).toBe(LAG_COMPENSATION_MS_MAX)
  })

  it('reads anything unusable as off', () => {
    // A stored file need not carry this key at all, and one written by hand may carry anything.
    const garbage = [undefined, null, '', 'fast', {}, [], Number.NaN, Number.POSITIVE_INFINITY]
    for (const value of garbage) {
      expect(normalizeLagCompensationMs(value)).toBe(0)
    }
  })

  it('never reads garbage as a delay that holds the rig back', () => {
    // Lights that run late for no visible reason are far harder to diagnose than lights that do
    // not, so nothing unreadable may arrive at a non-zero delay.
    for (const value of [undefined, null, 'nonsense', {}, [], Number.NaN]) {
      expect(normalizeLagCompensationMs(value)).toBe(0)
    }
  })
})
