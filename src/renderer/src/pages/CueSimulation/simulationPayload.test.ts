/**
 * What a simulated song event or instrument note carries to the main process.
 */
import { describe, expect, it } from '@jest/globals'
import { instrumentNotePayload, simulationContext } from './simulationPayload'

describe('simulationContext', () => {
  it('carries the venue, tempo, group and effect', () => {
    expect(simulationContext('Small', 140, 'group-1', { id: 'effect-1' })).toEqual({
      venueSize: 'Small',
      bpm: 140,
      cueGroup: 'group-1',
      effectId: 'effect-1',
    })
  })

  it('reports no effect as null rather than leaving the key out', () => {
    const context = simulationContext('Large', 120, 'group-1', null)

    expect(context.effectId).toBeNull()
    expect('effectId' in context).toBe(true)
  })

  it('reports an empty effect id as no effect', () => {
    expect(simulationContext('Large', 120, 'group-1', { id: '' }).effectId).toBeNull()
  })

  it('carries an unset group through as it is', () => {
    expect(simulationContext('NoVenue', 120, '', null).cueGroup).toBe('')
  })
})

describe('instrumentNotePayload', () => {
  const context = simulationContext('Large', 120, 'group-1', { id: 'effect-1' })

  it('adds the instrument and note to the same context', () => {
    expect(instrumentNotePayload(context, 'guitar', 'Red')).toEqual({
      ...context,
      instrument: 'guitar',
      noteType: 'Red',
    })
  })

  it('leaves the context it was given alone', () => {
    instrumentNotePayload(context, 'drums', 'Kick')

    expect(context).toEqual({
      venueSize: 'Large',
      bpm: 120,
      cueGroup: 'group-1',
      effectId: 'effect-1',
    })
  })
})
