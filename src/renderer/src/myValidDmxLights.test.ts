import { describe, expect, it } from '@jest/globals'
import { createStore } from 'jotai'
import { myDmxLightsAtom, myValidDmxLightsAtom } from './atoms'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../photonics-dmx/types'

function fixture(
  name: string,
  channels: Record<string, number>,
  extraChannels?: ExtraChannel[],
): DmxFixture {
  return {
    id: name,
    position: 0,
    fixture: FixtureTypes.RGB,
    label: name,
    name,
    isStrobeEnabled: false,
    channels: channels as unknown as DmxFixture['channels'],
    ...(extraChannels ? { extraChannels } : {}),
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

describe('myValidDmxLightsAtom with extra channels', () => {
  it('excludes a light with an unassigned (channel 0) extra channel', () => {
    const store = createStore()
    store.set(myDmxLightsAtom, [fixture('with-unassigned', RGB, [{ type: 'amber', channel: 0 }])])
    expect(store.get(myValidDmxLightsAtom)).toHaveLength(0)
  })

  it('includes a light whose fixed extra has a value of 0 but a valid channel number', () => {
    const store = createStore()
    store.set(myDmxLightsAtom, [
      fixture('with-fixed', RGB, [{ type: 'fixed', channel: 5, value: 0 }]),
    ])
    expect(store.get(myValidDmxLightsAtom).map((l) => l.name)).toEqual(['with-fixed'])
  })

  it('includes a light with all channels assigned', () => {
    const store = createStore()
    store.set(myDmxLightsAtom, [fixture('ok', RGB, [{ type: 'amber', channel: 5 }])])
    expect(store.get(myValidDmxLightsAtom).map((l) => l.name)).toEqual(['ok'])
  })
})
