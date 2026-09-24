let mockNowMs = 100000
jest.mock('../../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  CueGroupCatalog,
  type LightingCueGroupCatalog,
} from '../../../cues/registries/CueGroupCatalog'
import { CueSelectionPolicy } from '../../../cues/registries/CueSelectionPolicy'
import { CueStyle, type INetCue } from '../../../cues/interfaces/INetCue'
import type { ICueGroup } from '../../../cues/interfaces/INetCueGroup'
import { CueType } from '../../../cues/types/cueTypes'

class MockCue implements INetCue {
  constructor(private readonly name: string) {}
  get cueId(): string {
    return this.name
  }
  get id(): string {
    return this.name
  }
  style = CueStyle.Primary
  description = 'Mock cue'
  async execute(): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

const group = (id: string): ICueGroup => ({
  id,
  name: id,
  cues: new Map<CueType, INetCue>(
    [CueType.Verse, CueType.Chorus].map((t) => [t, new MockCue(`${id}-${t}`)]),
  ),
})

describe('CueSelectionPolicy consistency window', () => {
  let catalog: LightingCueGroupCatalog
  let policy: CueSelectionPolicy
  let groups: string[]

  beforeEach(() => {
    mockNowMs = 100000
    catalog = new CueGroupCatalog<CueType, INetCue, ICueGroup>()
    catalog.register(group('g1'))
    catalog.register(group('g2'))
    policy = new CueSelectionPolicy(catalog)
    policy.setStageKitPriority('random')
    groups = []
    policy.setStateUpdateCallback((state) => groups.push(state.groupId))
    // Every roll lands on the other group from the one before it.
    let flip = 0
    jest.spyOn(Math, 'random').mockImplementation(() => (flip++ % 2 === 0 ? 0 : 0.99))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  /** Verse and Chorus roll the first group, and the next roll lands on the second. */
  const rollFirstThenSecond = (): void => {
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
  }

  const select = (cueType: CueType, advanceMs = 0): string => {
    mockNowMs += advanceMs
    policy.selectCue(cueType, 'tracked')
    return groups[groups.length - 1]
  }

  it.each([0, 1, 100, 10000])(
    'keeps a held cue on its group through 33 ms keepalives and a 9 s gap at a %i ms window',
    (windowMs) => {
      policy.setCueConsistencyWindow(windowMs)
      const held = select(CueType.Verse)
      for (let i = 0; i < 60; i++) select(CueType.Verse, 33)
      select(CueType.Verse, 9000)
      for (let i = 0; i < 60; i++) select(CueType.Verse, 33)

      expect(new Set(groups)).toEqual(new Set([held]))
    },
  )

  it('reuses the group of a cue called again inside the window after another cue', () => {
    policy.setCueConsistencyWindow(2000)
    const verse = select(CueType.Verse)
    select(CueType.Chorus, 33)
    select(CueType.Chorus, 500)

    expect(select(CueType.Verse, 500)).toBe(verse)
  })

  it('rolls afresh for a cue called again outside the window after another cue', () => {
    policy.setCueConsistencyWindow(2000)
    rollFirstThenSecond()
    const verse = select(CueType.Verse)
    select(CueType.Chorus, 33)
    select(CueType.Chorus, 1500)

    expect(select(CueType.Verse, 1500)).not.toBe(verse)
  })

  it('keeps the held cue and rolls on recurrence at a window of 0', () => {
    policy.setCueConsistencyWindow(0)
    rollFirstThenSecond()
    const verse = select(CueType.Verse)
    for (let i = 0; i < 10; i++) expect(select(CueType.Verse, 33)).toBe(verse)
    select(CueType.Chorus, 33)

    expect(select(CueType.Verse, 33)).not.toBe(verse)
  })
})
