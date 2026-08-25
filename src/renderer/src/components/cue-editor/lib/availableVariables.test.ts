import { enrichAvailableVariables, type AvailableVariable } from './availableVariables'
import type { LogicNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getNetCueDataPropertyMeta } from '../../../../../photonics-dmx/constants/cueDataPropertyMeta'

const cueDataNode = (assignTo: string, dataProperty: string): LogicNode =>
  ({ logicType: 'cue-data', assignTo, dataProperty }) as unknown as LogicNode

const variable = (name: string, extra: Partial<AvailableVariable> = {}): AvailableVariable => ({
  name,
  type: 'string',
  scope: 'cue',
  ...extra,
})

describe('enrichAvailableVariables', () => {
  it('gives a variable the valid values of the cue-data property feeding it', () => {
    const expected = getNetCueDataPropertyMeta('song-section')?.validValues
    expect(expected?.length).toBeGreaterThan(0)

    const [enriched] = enrichAvailableVariables(
      [variable('section')],
      [cueDataNode('section', 'song-section')],
      'yarg',
    )

    expect(enriched.validValues).toEqual([...expected!])
  })

  it('leaves a variable that already declares its own valid values', () => {
    const own = ['a', 'b']
    const [enriched] = enrichAvailableVariables(
      [variable('section', { validValues: own })],
      [cueDataNode('section', 'song-section')],
      'yarg',
    )

    expect(enriched.validValues).toBe(own)
  })

  it('leaves variables no cue-data node assigns to', () => {
    const input = [variable('untouched')]
    const result = enrichAvailableVariables(input, [cueDataNode('section', 'song-section')], 'yarg')

    expect(result[0].validValues).toBeUndefined()
  })

  it('returns the input unchanged when no logic node derives valid values', () => {
    const input = [variable('section')]

    expect(enrichAvailableVariables(input, [], 'yarg')).toBe(input)
    expect(enrichAvailableVariables(input, undefined, 'yarg')).toBe(input)
  })

  it('ignores a cue-data node missing its assignment or property', () => {
    const input = [variable('section')]
    const incomplete = [
      { logicType: 'cue-data', dataProperty: 'song-section' },
      { logicType: 'cue-data', assignTo: 'section' },
      { logicType: 'math', assignTo: 'section', dataProperty: 'song-section' },
    ] as unknown as LogicNode[]

    expect(enrichAvailableVariables(input, incomplete, 'yarg')).toBe(input)
  })
})
