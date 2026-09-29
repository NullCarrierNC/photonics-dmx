import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  SETTINGS,
  seededRandom,
  cuesInLibrary,
  listContent,
  motionCuesInLibrary,
  reduceTimeline,
  fingerprintOf,
  renderList,
  parseList,
  compareFingerprints,
  describeMove,
  cueVersionProblems,
} = require('../../../../tools/cueSimCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Light = {
  red: number
  green: number
  blue: number
  intensity: number
  opacity: number
  blendMode: string
} | null
type Sample = { timeMs: number; lights: Record<string, Light>; events: string[] }

const LIGHTS = ['front-1', 'front-2', 'back-3']
const colour = (red: number, green: number, blue: number): Light => ({
  red,
  green,
  blue,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
})

/** A timeline where front-1 turns red at 100 ms and blue at `blueAt`, the rest stay dark. */
const timeline = (blueAt: number, blue: Light = colour(0, 0, 255)): Sample[] => {
  const row = (timeMs: number, front1: Light): Sample => ({
    timeMs,
    lights: { 'front-1': front1, 'front-2': null, 'back-3': null },
    events: [],
  })
  return [
    row(0, null),
    row(100, colour(255, 0, 0)),
    row(150, colour(255, 0, 0)),
    row(blueAt, blue),
    row(4000, blue),
  ]
}

describe('cue listing', () => {
  it('keys every cue of a lighting library by domain, library and cue', () => {
    const library = {
      group: { id: 'yarg-fade' },
      cues: [{ cueType: 'Menu' }, { cueType: 'Default' }],
    }
    expect(cuesInLibrary('yarg', 'yarg-fade.json', library)).toEqual([
      { key: 'yarg__yarg-fade__Menu', domain: 'yarg', library: 'yarg-fade', cue: 'Menu' },
      { key: 'yarg__yarg-fade__Default', domain: 'yarg', library: 'yarg-fade', cue: 'Default' },
    ])
  })

  it('names a library by its file when it has no group id, and reads audio cue ids', () => {
    const library = { cues: [{ cueTypeId: 'audio-rock-pulse' }] }
    expect(
      cuesInLibrary('audio', 'audio-rock.json', library).map(({ key }: { key: string }) => key),
    ).toEqual(['audio__audio-rock__audio-rock-pulse'])
  })

  it('skips motion libraries', () => {
    const library = { group: { id: 'yarg-motion-default' }, cues: [{ cueType: 'Menu' }] }
    expect(cuesInLibrary('yarg', 'yarg-motion-default.json', library)).toEqual([])
  })
})

describe('list content', () => {
  it('reads the same for lists holding the same fingerprints in another order and spacing', () => {
    const header = 'duration 4000 bpm 120'
    const a = 'yarg__x__Menu 0123456789ab 0a1b2c.3d4e5f 1a2b.3c4d'
    const b = 'yarg__x__Verse ba9876543210 0a1b2c.3d4e5f 1a2b.3c4d'

    expect(listContent(`${header}\n${a}\n${b}\n`)).toBe(listContent(`${header}\n\n${b} \n${a}`))
    expect(listContent(`${header}\n${a}\n`)).not.toBe(listContent(`${header}\n${b}\n`))
    expect(listContent(null)).toBeNull()
  })
})

describe('motion cue listing', () => {
  it('runs each motion cue beside a steady lighting cue of its domain', () => {
    const library = {
      group: { id: 'yarg-motion-default' },
      cues: [{ id: 'motion-still' }, { id: 'motion-nod-slow' }],
    }
    expect(motionCuesInLibrary('yarg', 'yarg-motion-default.json', library)).toEqual([
      {
        key: 'yarg__yarg-motion-default__motion-still',
        domain: 'yarg',
        library: 'yarg-stagekit',
        cue: 'Cool_Automatic',
        motion: { groupId: 'yarg-motion-default', cueId: 'motion-still' },
      },
      expect.objectContaining({ key: 'yarg__yarg-motion-default__motion-nod-slow' }),
    ])
  })

  it('lists nothing for a lighting library', () => {
    const library = { group: { id: 'yarg-fade' }, cues: [{ cueType: 'Menu' }] }
    expect(motionCuesInLibrary('yarg', 'yarg-fade.json', library)).toEqual([])
  })
})

describe('seeded random', () => {
  it('repeats its sequence for the same cue and differs between cues', () => {
    const first = seededRandom('yarg__a__Menu')
    const again = seededRandom('yarg__a__Menu')
    const other = seededRandom('yarg__a__Default')
    const draw = (next: () => number): number[] => [next(), next(), next()]
    const a = draw(first)
    expect(draw(again)).toEqual(a)
    expect(draw(other)).not.toEqual(a)
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('timeline reduction', () => {
  it('keeps each light only where its state changes', () => {
    const reduced = reduceTimeline(timeline(1100))
    expect(reduced.lights).toEqual(LIGHTS)
    expect(reduced.changes['front-1'].map(([t]: [number, string]) => t)).toEqual([0, 100, 1100])
    expect(reduced.changes['front-2']).toEqual([[0, 'off']])
  })
})

describe('fingerprints', () => {
  it('match for the same timeline', () => {
    const a = fingerprintOf(reduceTimeline(timeline(1100)))
    const b = fingerprintOf(reduceTimeline(timeline(1100)))
    expect(a).toEqual(b)
  })

  it('move only the digests of the light and the windows a change touches', () => {
    const before = fingerprintOf(reduceTimeline(timeline(1100)))
    const after = fingerprintOf(reduceTimeline(timeline(1100, colour(0, 255, 0))))
    expect(after.digest).not.toBe(before.digest)
    expect(after.lights.map((d: string, i: number) => d !== before.lights[i])).toEqual([
      true,
      false,
      false,
    ])
    const moved = after.windows.map((d: string, i: number) => d !== before.windows[i])
    expect(moved.indexOf(true)).toBe(Math.floor(1100 / SETTINGS.windowMs))
  })

  it('round-trip through the committed list', () => {
    const entries = new Map([
      ['yarg__a__Menu', fingerprintOf(reduceTimeline(timeline(1100)))],
      ['rb3__b__Default', fingerprintOf(reduceTimeline(timeline(2000)))],
    ])
    const parsed = parseList(renderList(entries))
    expect(parsed.settingsMatch).toBe(true)
    expect(parsed.malformed).toEqual([])
    expect(parsed.entries).toEqual(entries)
  })

  it('report a list recorded under other simulation settings', () => {
    const text = renderList(new Map()).replace(`bpm ${SETTINGS.bpm}`, 'bpm 90')
    expect(parseList(text).settingsMatch).toBe(false)
  })
})

describe('comparison', () => {
  it('reports moved, new and missing cues', () => {
    const one = fingerprintOf(reduceTimeline(timeline(1100)))
    const two = fingerprintOf(reduceTimeline(timeline(2000)))
    const expected = new Map([
      ['yarg__a__Menu', one],
      ['yarg__a__Gone', one],
    ])
    const actual = new Map([
      ['yarg__a__Menu', two],
      ['yarg__a__New', one],
    ])
    expect(compareFingerprints(expected, actual)).toEqual({
      moved: ['yarg__a__Menu'],
      added: ['yarg__a__New'],
      missing: ['yarg__a__Gone'],
    })
  })

  it('describes a moved cue by where it first differs and what its lights show now', () => {
    const before = fingerprintOf(reduceTimeline(timeline(1100)))
    const reduced = reduceTimeline(timeline(1100, colour(0, 255, 0)))
    const lines: string[] = describeMove('yarg__a__Menu', before, fingerprintOf(reduced), reduced)
    const text = lines.join('\n')
    expect(text).toContain('yarg__a__Menu')
    expect(text).toContain('first differs between 1000 and 1250 ms')
    expect(text).toContain('front-1')
    expect(text).toContain('1100 ms rgb 0,255,0')
    expect(text).not.toContain('front-2')
    expect(text).not.toContain(before.digest)
  })
})

describe('cueVersion guard', () => {
  const file = (cueVersion: number | undefined, colourName: string): string =>
    JSON.stringify({ cueVersion, bundled: true, cues: [{ colour: colourName }] }, null, 2)
  const path = 'resources/defaults/node-data/cues/yarg/yarg-fade.json'

  it('refuses a changed file whose cueVersion did not rise', () => {
    expect(cueVersionProblems([{ path, base: file(3, 'red'), current: file(3, 'blue') }])).toEqual([
      expect.stringContaining(path),
    ])
  })

  it('treats a missing cueVersion as 0', () => {
    expect(
      cueVersionProblems([{ path, base: file(undefined, 'red'), current: file(0, 'blue') }]),
    ).toHaveLength(1)
    expect(
      cueVersionProblems([{ path, base: file(undefined, 'red'), current: file(1, 'blue') }]),
    ).toEqual([])
  })

  it('accepts a raised cueVersion, a formatting-only change, a new file and a deleted one', () => {
    expect(
      cueVersionProblems([
        { path, base: file(3, 'red'), current: file(4, 'blue') },
        { path, base: file(3, 'red'), current: JSON.stringify(JSON.parse(file(3, 'red'))) },
        { path, base: null, current: file(1, 'red') },
        { path, base: file(1, 'red'), current: null },
      ]),
    ).toEqual([])
  })

  it('refuses a file that is not valid JSON', () => {
    expect(cueVersionProblems([{ path, base: file(3, 'red'), current: '{' }])).toEqual([
      expect.stringContaining(path),
    ])
  })
})
