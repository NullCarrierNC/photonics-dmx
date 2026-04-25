import { describe, expect, it } from '@jest/globals'
import { backLightBearingIsFlipped, reflectBearingUsDs } from './stageDirections'

describe('reflectBearingUsDs', () => {
  it('swaps US and DS', () => {
    expect(reflectBearingUsDs(0)).toBe(180)
    expect(reflectBearingUsDs(180)).toBe(0)
  })

  it('leaves stage-right and stage-left unchanged', () => {
    expect(reflectBearingUsDs(90)).toBe(90)
    expect(reflectBearingUsDs(270)).toBe(270)
  })

  it('maps diagonals consistently', () => {
    expect(reflectBearingUsDs(45)).toBe(135)
    expect(reflectBearingUsDs(135)).toBe(45)
    expect(reflectBearingUsDs(225)).toBe(315)
    expect(reflectBearingUsDs(315)).toBe(225)
  })
})

describe('backLightBearingIsFlipped', () => {
  it('is true only for front-back back row', () => {
    expect(backLightBearingIsFlipped('front-back', 'back')).toBe(true)
    expect(backLightBearingIsFlipped('two-rows', 'back')).toBe(false)
    expect(backLightBearingIsFlipped('front-back', 'front')).toBe(false)
    expect(backLightBearingIsFlipped(undefined, 'back')).toBe(false)
  })
})
