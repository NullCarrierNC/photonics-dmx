import { describe, expect, it } from '@jest/globals'
import { cueFileLoadMessages } from './cueFileLoadMessages'

describe('cueFileLoadMessages', () => {
  it('says nothing when the load has nothing to report', () => {
    expect(
      cueFileLoadMessages([{ source: 'node-cue', errors: [], migrations: [], unsaved: [] }]),
    ).toEqual([])
  })

  it('reports saved updates as files an older version wrote', () => {
    const messages = cueFileLoadMessages([
      {
        source: 'effect',
        errors: [],
        migrations: ["mine.json: 'beat-count' is now 'beat_count'."],
        unsaved: [],
      },
    ])

    expect(messages).toEqual([
      {
        level: 'warning',
        text: "Effect files saved by an older version were updated to load in this one: mine.json: 'beat-count' is now 'beat_count'.",
      },
    ])
  })

  it('reports a file left unsaved apart from saved updates, and never as older', () => {
    const unsavedLine =
      'mine.json: Could not save the update from an older version (EACCES), so each load updates it again: Cues stored with no kind now read as lighting cues.'
    const messages = cueFileLoadMessages([
      { source: 'node-cue', errors: [], migrations: [], unsaved: [unsavedLine] },
    ])

    expect(messages).toEqual([
      {
        level: 'warning',
        text: `Cue files read differently here and left as they are on disk: ${unsavedLine}`,
      },
    ])
    expect(messages[0].text).not.toMatch(/saved by an older version/)
  })

  it('reports refused files as errors', () => {
    const messages = cueFileLoadMessages([
      { source: 'node-cue', errors: ['a.json: bad', 'b.json: bad'], migrations: [], unsaved: [] },
    ])

    expect(messages).toEqual([
      { level: 'error', text: 'Cue file validation failed (2 files): a.json: bad; b.json: bad' },
    ])
  })
})
