import { resolveCueKindSelection } from './cueKindSync'
import type { EditorDocument } from './types'

describe('resolveCueKindSelection', () => {
  const cueDoc = (
    cues: Array<{ id: string; kind: 'lighting' | 'motion'; name?: string }>,
  ): EditorDocument =>
    ({
      mode: 'cue',
      path: '/cues/file.json',
      file: {
        mode: 'yarg',
        group: { id: 'g', name: 'Group' },
        cues,
      },
    }) as unknown as EditorDocument

  it('does nothing outside cue mode or without a document', () => {
    expect(
      resolveCueKindSelection(
        'effect',
        cueDoc([{ id: 'cue-1', kind: 'lighting' }]),
        'lighting',
        'cue-1',
      ),
    ).toEqual({ action: 'none' })
    expect(resolveCueKindSelection('cue', null, 'lighting', 'cue-1')).toEqual({ action: 'none' })
  })

  it('clears when the filtered kind has no matching cues', () => {
    expect(
      resolveCueKindSelection(
        'cue',
        cueDoc([{ id: 'cue-1', kind: 'lighting' }]),
        'motion',
        'cue-1',
      ),
    ).toEqual({ action: 'clear' })
  })

  it('reselects the first matching cue when the current selection is absent', () => {
    const doc = cueDoc([
      { id: 'light-1', kind: 'lighting' },
      { id: 'motion-1', kind: 'motion' },
    ])

    expect(resolveCueKindSelection('cue', doc, 'motion', 'light-1')).toEqual({
      action: 'select',
      cue: expect.objectContaining({ id: 'motion-1' }),
    })
  })

  it('leaves a valid selection untouched', () => {
    const doc = cueDoc([
      { id: 'light-1', kind: 'lighting' },
      { id: 'motion-1', kind: 'motion' },
    ])

    expect(resolveCueKindSelection('cue', doc, 'motion', 'motion-1')).toEqual({ action: 'none' })
  })

  it('clears when the document holds no cues at all', () => {
    expect(resolveCueKindSelection('cue', cueDoc([]), 'lighting', null)).toEqual({
      action: 'clear',
    })
  })

  it('reselects alphabetically rather than in file order', () => {
    const doc = cueDoc([
      { id: 'motion-z', kind: 'motion', name: 'Zulu' },
      { id: 'motion-a', kind: 'motion', name: 'Alpha' },
    ])

    expect(resolveCueKindSelection('cue', doc, 'motion', null)).toEqual({
      action: 'select',
      cue: expect.objectContaining({ id: 'motion-a' }),
    })
  })
})
