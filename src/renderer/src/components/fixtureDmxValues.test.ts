/**
 * The per-fixture value comparison the preview memoizes on. The publisher hands the renderer a
 * fresh buffer object every frame, so a fixture is only allowed to skip a redraw when the addresses
 * it actually occupies still read the same.
 */
import { describe, expect, it } from '@jest/globals'
import { FixtureTypes, type DmxLight } from '../../../photonics-dmx/types'
import { fixtureChannelNumbers, fixtureDmxValuesEqual } from './fixtureDmxValues'

function light(over: Partial<DmxLight> = {}): DmxLight {
  return {
    id: 'l1',
    fixtureId: 't1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxLight['channels'],
    ...over,
  } as DmxLight
}

describe('fixtureChannelNumbers', () => {
  it('covers the base channels and the added ones', () => {
    const l = light({ extraChannels: [{ type: 'amber', channel: 9 }] })
    expect(fixtureChannelNumbers(l).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 9])
  })
})

describe('fixtureDmxValuesEqual', () => {
  it('treats separate buffers holding the same values as equal', () => {
    const l = light()
    expect(fixtureDmxValuesEqual(l, { 1: 255, 2: 10 }, { 1: 255, 2: 10 })).toBe(true)
  })

  it("reports a change on one of the fixture's own channels", () => {
    const l = light()
    expect(fixtureDmxValuesEqual(l, { 1: 255, 2: 10 }, { 1: 255, 2: 11 })).toBe(false)
  })

  it('reports a change on an added channel', () => {
    const l = light({ extraChannels: [{ type: 'amber', channel: 9 }] })
    expect(fixtureDmxValuesEqual(l, { 9: 0 }, { 9: 200 })).toBe(false)
  })

  it('ignores addresses the fixture does not occupy', () => {
    const l = light()
    expect(fixtureDmxValuesEqual(l, { 1: 255, 77: 0 }, { 1: 255, 77: 255 })).toBe(true)
  })

  it('treats a missing address as zero rather than a change', () => {
    const l = light()
    expect(fixtureDmxValuesEqual(l, {}, { 1: 0, 2: 0, 3: 0, 4: 0 })).toBe(true)
  })
})
