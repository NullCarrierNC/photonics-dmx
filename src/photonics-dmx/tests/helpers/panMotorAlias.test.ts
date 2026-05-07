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

  it('continuity mode picks alias nearest to preferred in linear motor space', () => {
    const chosen = pickAliasedPanMotorDeg(0, 540, 330, 'continuity')
    expect(chosen).toBe(360)
  })

  it('continuity mode: upper overflow uses wrapped alias (set-position / explicit wrap)', () => {
    const chosen = pickAliasedPanMotorDeg(565, 540, 540, 'continuity')
    expect(chosen).toBe(205)
  })

  it('continuity mode: lower overflow uses wrapped alias', () => {
    const chosen = pickAliasedPanMotorDeg(-25, 540, 0, 'continuity')
    expect(chosen).toBe(335)
  })

  it('continuity mode: still picks closest alias when raw is in range', () => {
    const chosen = pickAliasedPanMotorDeg(520, 540, 540, 'continuity')
    expect(chosen).toBe(520)
  })

  it('intent mode: still picks wrapped alias when raw is out of range (bearing intent)', () => {
    const chosen = pickAliasedPanMotorDeg(565, 540, 540, 'intent')
    expect(chosen).toBe(205)
  })

  it('maps negative raw to positive alias when preferred is far from clamp', () => {
    const chosen = pickAliasedPanMotorDeg(-30, 540, 330, 'continuity')
    expect(chosen).toBe(330)
  })

  it('continuity-clamp mode: upper overflow prefers clamp when closer to preferred than wrap', () => {
    expect(pickAliasedPanMotorDeg(565, 540, 540, 'continuity-clamp')).toBe(540)
  })

  it('continuity-clamp mode: lower overflow prefers clamp when closer to preferred than wrap', () => {
    expect(pickAliasedPanMotorDeg(-25, 540, 0, 'continuity-clamp')).toBe(0)
  })

  it('continuity-clamp mode: when wrap is linearly closer than clamp, keeps wrapped alias', () => {
    expect(pickAliasedPanMotorDeg(565, 540, 270, 'continuity-clamp')).toBe(205)
  })
})

describe('logicalPanPercentFromMotorDeg', () => {
  it('maps full range to 0–100', () => {
    expect(logicalPanPercentFromMotorDeg(270, 540)).toBeCloseTo(50, 5)
    expect(logicalPanPercentFromMotorDeg(0, 540)).toBe(0)
    expect(logicalPanPercentFromMotorDeg(540, 540)).toBe(100)
  })
})
