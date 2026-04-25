import { describe, expect, it } from '@jest/globals'
import { logicalPanPercentFromMotorDeg, pickAliasedPanMotorDeg } from '../../helpers/panMotorAlias'

describe('pickAliasedPanMotorDeg', () => {
  it('intent mode prefers 360 over 0 when raw intent is 360 (540° fixture)', () => {
    const chosen = pickAliasedPanMotorDeg(360, 540, 0, 'intent')
    expect(chosen).toBe(360)
  })

  it('intent mode prefers 0 over 360 when raw intent is 0', () => {
    const chosen = pickAliasedPanMotorDeg(0, 540, 200, 'intent')
    expect(chosen).toBe(0)
  })

  it('continuity mode picks alias nearest to preferred in circular space', () => {
    const chosen = pickAliasedPanMotorDeg(0, 540, 330, 'continuity')
    expect(chosen).toBe(360)
  })

  it('maps negative raw to positive alias for 540° range', () => {
    const chosen = pickAliasedPanMotorDeg(-30, 540, 0, 'continuity')
    expect(chosen).toBe(330)
  })
})

describe('logicalPanPercentFromMotorDeg', () => {
  it('maps full range to 0–100', () => {
    expect(logicalPanPercentFromMotorDeg(270, 540)).toBeCloseTo(50, 5)
    expect(logicalPanPercentFromMotorDeg(0, 540)).toBe(0)
    expect(logicalPanPercentFromMotorDeg(540, 540)).toBe(100)
  })
})
