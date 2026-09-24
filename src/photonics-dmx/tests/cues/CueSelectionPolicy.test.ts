// Controllable monotonic clock (the `mock`-prefixed binding is read on every call).
let mockNowMs = 100000
jest.mock('../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import {
  CueGroupCatalog,
  type LightingCueGroupCatalog,
} from '../../cues/registries/CueGroupCatalog'
import { CueSelectionPolicy, CueStateUpdate } from '../../cues/registries/CueSelectionPolicy'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals'

class MockCue implements INetCue {
  constructor(
    private _name: string,
    public style: CueStyle = CueStyle.Primary,
  ) {}
  get cueId(): string {
    return this._name
  }
  get id(): string {
    return this._name
  }
  description = 'Mock cue'
  async execute(
    _data: CueData,
    _controller: ILightingController,
    _lightManager: DmxLightManager,
  ): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

const cueGroup = (id: string, style: CueStyle, cueTypes: CueType[]): ICueGroup => ({
  id,
  name: id,
  cues: new Map(cueTypes.map((t) => [t, new MockCue(`${id}-${t}`, style)])),
})

describe('CueSelectionPolicy', () => {
  let catalog: LightingCueGroupCatalog
  let policy: CueSelectionPolicy
  let seen: CueStateUpdate[]

  const registerPair = (style: CueStyle): void => {
    catalog.register(cueGroup('groupA', style, [CueType.Chorus, CueType.Verse]))
    catalog.register(cueGroup('groupB', style, [CueType.Chorus, CueType.Verse]))
  }

  beforeEach(() => {
    mockNowMs = 100000
    catalog = new CueGroupCatalog<CueType, INetCue, ICueGroup>()
    policy = new CueSelectionPolicy(catalog)
    seen = []
    policy.setStateUpdateCallback((state) => seen.push(state))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('selection ladder', () => {
    it('serves from an active group and falls back to the default', () => {
      catalog.register(cueGroup('a', CueStyle.Primary, [CueType.Chorus]))
      catalog.register(cueGroup('def', CueStyle.Primary, [CueType.Default]))
      catalog.setDefaultGroup('def')
      catalog.setActiveGroups(['a'])

      expect(policy.selectCue(CueType.Chorus)!.cueId).toBe('a-Chorus')
      const fallback = policy.selectCue(CueType.Default)
      expect(fallback!.cueId).toBe('def-Default')
      expect(seen[1].isFallback).toBe(true)
    })

    it('returns null when nothing implements the cue', () => {
      catalog.register(cueGroup('a', CueStyle.Primary, [CueType.Chorus]))
      expect(policy.selectCue(CueType.BigRockEnding)).toBeNull()
    })

    it('prefers the stage kit group for tracked songs and skips it when simulated', () => {
      registerPair(CueStyle.Primary)
      catalog.setStageKitGroup('groupA')

      expect(policy.selectCue(CueType.Chorus, 'tracked')!.cueId).toBe('groupA-Chorus')

      policy.setStageKitPriority('never')
      policy.setCueConsistencyWindow(0)
      const groups = new Set<string>()
      for (let i = 0; i < 40; i++) {
        groups.add(policy.selectCue(CueType.Chorus, 'tracked')!.cueId)
        policy.selectCue(CueType.Verse, 'tracked')
      }
      expect(groups.size).toBe(2)
    })

    it('keeps a held cue on its group at a window of 0, whatever the roll', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(0)
      let flip = 0
      jest.spyOn(Math, 'random').mockImplementation(() => (flip++ % 2 === 0 ? 0 : 0.99))

      const first = policy.selectCue(CueType.Chorus)!
      for (let i = 0; i < 30; i++) {
        expect(policy.selectCue(CueType.Chorus)).toBe(first)
      }
    })

    it('rolls again at a window of 0 when the chart calls a cue after another', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(0)
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.99)

      expect(policy.selectCue(CueType.Chorus)!.cueId).toBe('groupA-Chorus')
      policy.selectCue(CueType.Verse)
      expect(policy.selectCue(CueType.Chorus)!.cueId).toBe('groupB-Chorus')
    })

    it('pins the selection inside the consistency window', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)

      const first = policy.selectCue(CueType.Chorus)!
      for (let i = 0; i < 10; i++) {
        expect(policy.selectCue(CueType.Chorus)!.cueId).toBe(first.cueId)
      }
    })

    it('locks a single group for the whole song in oncePerSong mode', () => {
      registerPair(CueStyle.Primary)
      policy.setCueGroupSelectionMode('oncePerSong')
      policy.onSongStart()
      policy.setCueConsistencyWindow(0)

      const first = policy.selectCue(CueType.Chorus)
      const lockedGroup = seen[0].groupId
      expect(first).toBe(catalog.getGroup(lockedGroup)?.cues.get(CueType.Chorus))
      for (let i = 0; i < 10; i++) {
        policy.selectCue(CueType.Chorus)
        policy.selectCue(CueType.Verse)
      }
      expect(seen.every((u) => u.groupId === lockedGroup)).toBe(true)

      policy.onSongEnd()
      const chorusCues = ['groupA', 'groupB'].map((id) =>
        catalog.getGroup(id)?.cues.get(CueType.Chorus),
      )
      expect(chorusCues).toContain(policy.selectCue(CueType.Chorus))
    })

    it('does not lock on a fallback selection, even once the default group turns active again', () => {
      // A fallback selection can only ever come from a group that getRandomCueFromActiveGroups
      // did NOT already treat as a normal active candidate, i.e. one that is registered but not
      // currently active (see getActiveGroupsImplementing). If it later becomes active for a
      // shared cue type, the lock must still be free to seed at random between it and any other
      // active group, rather than having already been pinned to it by the earlier fallback pick.
      const trials = 30
      const groupsSeenForChorus = new Set<string>()

      for (let i = 0; i < trials; i++) {
        const trialCatalog = new CueGroupCatalog<CueType, INetCue, ICueGroup>()
        const trialPolicy = new CueSelectionPolicy(trialCatalog)
        trialCatalog.register(cueGroup('groupA', CueStyle.Primary, [CueType.Chorus, CueType.Verse]))
        trialCatalog.register(
          cueGroup('def', CueStyle.Primary, [CueType.Chorus, CueType.Verse, CueType.BigRockEnding]),
        )
        trialCatalog.setDefaultGroup('def')
        // Only 'def' implements BigRockEnding, and it starts inactive, so this can only resolve
        // as a fallback.
        trialCatalog.setActiveGroups(['groupA'])
        trialPolicy.setCueGroupSelectionMode('oncePerSong')
        trialPolicy.onSongStart()

        const fallback = trialPolicy.selectCue(CueType.BigRockEnding)
        expect(fallback!.cueId).toBe('def-BigRockEnding')

        // The user (or a group-rotation feature) re-enables the default group mid-song.
        trialCatalog.setActiveGroups(['groupA', 'def'])
        const chorus = trialPolicy.selectCue(CueType.Chorus)!
        groupsSeenForChorus.add(chorus.cueId.startsWith('groupA') ? 'groupA' : 'def')
      }

      // Wrongly seeding the lock from the earlier fallback would force every trial onto 'def'.
      expect(groupsSeenForChorus.has('groupA')).toBe(true)
    })
  })

  describe('role accounting', () => {
    it('counts consecutive resolutions and restarts on cue type change', () => {
      catalog.register(cueGroup('only', CueStyle.Primary, [CueType.Chorus, CueType.Verse]))

      policy.selectCue(CueType.Chorus)
      policy.selectCue(CueType.Chorus)
      policy.selectCue(CueType.Verse)

      expect(seen.map((u) => u.counter)).toEqual([1, 2, 1])
      expect(seen[0].limit).toBe(100)
    })

    it('tracks the two roles independently', () => {
      catalog.register(cueGroup('p', CueStyle.Primary, [CueType.Chorus]))
      catalog.register(cueGroup('s', CueStyle.Secondary, [CueType.Verse]))

      policy.selectCue(CueType.Chorus)
      policy.selectCue(CueType.Verse)
      policy.selectCue(CueType.Chorus)

      expect(seen.map((u) => [u.cueStyle, u.counter, u.limit])).toEqual([
        ['primary', 1, 100],
        ['secondary', 1, 50],
        ['primary', 2, 100],
      ])
    })

    it('selectFromGroup records state against the role', () => {
      registerPair(CueStyle.Secondary)

      for (let i = 0; i < 60; i++) {
        policy.selectFromGroup(CueType.Chorus, 'groupA')
      }

      expect(seen.every((u) => u.groupId === 'groupA')).toBe(true)
      expect(seen[59].counter).toBe(60)
      expect(policy.getCueState(CueType.Chorus)).toMatchObject({ groupId: 'groupA', counter: 60 })
    })

    it('selectFromGroup falls back to the default group', () => {
      catalog.register(cueGroup('a', CueStyle.Primary, [CueType.Chorus]))
      catalog.register(cueGroup('def', CueStyle.Primary, [CueType.Default]))
      catalog.setDefaultGroup('def')

      const cue = policy.selectFromGroup(CueType.Default, 'a')
      expect(cue!.cueId).toBe('def-Default')
      expect(seen[0].isFallback).toBe(true)
    })

    it('getCueState mirrors the last emitted update and resetRoleState clears it', () => {
      catalog.register(cueGroup('only', CueStyle.Primary, [CueType.Chorus]))

      policy.selectCue(CueType.Chorus)
      policy.selectCue(CueType.Chorus)

      expect(policy.getCueState(CueType.Chorus)).toEqual(seen[1])
      expect(policy.getCueState(CueType.Verse)).toBeNull()

      policy.resetRoleState()
      expect(policy.getCueState(CueType.Chorus)).toBeNull()
      expect(policy.roleSnapshots().lastPrimaryCue).toMatchObject({ name: null, counter: 0 })
    })
  })

  describe('group stability', () => {
    it('keeps the primary group for 101 resolutions inside the consistency window', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)

      for (let i = 0; i < 101; i++) {
        policy.selectCue(CueType.Chorus)
      }

      expect(seen.every((u) => u.groupId === seen[0].groupId)).toBe(true)
      expect(seen[100].counter).toBe(101)
    })

    it('keeps the secondary group across a long run', () => {
      registerPair(CueStyle.Secondary)
      policy.setCueConsistencyWindow(2000)

      for (let i = 0; i < 51; i++) {
        policy.selectCue(CueType.Chorus)
      }

      expect(seen.every((u) => u.groupId === seen[0].groupId)).toBe(true)
      expect(seen[50].counter).toBe(51)
    })

    it('holds the locked group across a long run', () => {
      registerPair(CueStyle.Secondary)
      policy.setCueGroupSelectionMode('oncePerSong')
      policy.onSongStart()

      for (let i = 0; i < 51; i++) {
        policy.selectCue(CueType.Chorus)
      }

      expect(seen.every((u) => u.groupId === seen[0].groupId)).toBe(true)
      expect(seen[50].counter).toBe(51)
    })

    it('holds the stage kit group across a long run', () => {
      catalog.register(cueGroup('kit', CueStyle.Secondary, [CueType.Chorus]))
      catalog.register(cueGroup('other', CueStyle.Secondary, [CueType.Chorus]))
      catalog.setStageKitGroup('kit')

      for (let i = 0; i < 51; i++) {
        policy.selectCue(CueType.Chorus, 'tracked')
      }

      expect(seen.every((u) => u.groupId === 'kit')).toBe(true)
      expect(seen[50].counter).toBe(51)
    })

    it('keeps the pin alive while resolutions keep arriving', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)

      policy.selectCue(CueType.Chorus)
      for (let i = 0; i < 5; i++) {
        mockNowMs += 1500
        policy.selectCue(CueType.Chorus)
      }

      expect(seen.every((u) => u.groupId === seen[0].groupId)).toBe(true)
    })

    it('allows a re-roll once the window expires after another cue', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)

      jest.spyOn(Math, 'random').mockReturnValue(0)
      policy.selectCue(CueType.Chorus)
      policy.selectCue(CueType.Verse)
      const pinned = seen[0].groupId
      const candidates = catalog.getActiveGroupsImplementing(CueType.Chorus)
      const otherIndex = candidates.findIndex((groupId) => groupId !== pinned)

      mockNowMs += 2001
      jest.spyOn(Math, 'random').mockReturnValue(otherIndex / candidates.length)
      policy.selectCue(CueType.Chorus)

      expect(seen[2].groupId).toBe(candidates[otherIndex])
    })

    it('stays on the current group when the stage kit priority changes', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)
      jest.spyOn(Math, 'random').mockReturnValue(0)

      for (let i = 0; i < 100; i++) {
        policy.selectCue(CueType.Chorus)
      }
      const held = seen[0].groupId

      policy.setStageKitPriority('never')
      policy.selectCue(CueType.Chorus)

      expect(seen[100].groupId).toBe(held)
    })
  })

  describe('consistency management', () => {
    it('drops the pin for a group that is cleared or deactivated', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(2000)

      policy.selectCue(CueType.Chorus)
      const pinned = seen[0].groupId
      const other = pinned === 'groupA' ? 'groupB' : 'groupA'

      catalog.setActiveGroups([other])
      policy.clearGroupConsistencyTracking(pinned)

      policy.selectCue(CueType.Chorus)
      expect(seen[1].groupId).toBe(other)
    })

    it('reports tracked cues through getConsistencyStatus', () => {
      catalog.register(cueGroup('only', CueStyle.Primary, [CueType.Chorus]))
      policy.setCueConsistencyWindow(2000)

      policy.selectCue(CueType.Chorus)

      const status = policy.getConsistencyStatus()
      expect(status.windowMs).toBe(2000)
      expect(status.trackedCues).toHaveLength(1)
      expect(status.trackedCues[0]).toMatchObject({
        cueType: CueType.Chorus,
        lastGroupId: 'only',
        isWithinWindow: true,
      })

      policy.clearCueConsistencyTracking(CueType.Chorus)
      expect(policy.getConsistencyStatus().trackedCues).toHaveLength(0)
    })

    it('reset restores defaults but keeps the consistency window', () => {
      registerPair(CueStyle.Primary)
      policy.setCueConsistencyWindow(1234)
      policy.setStageKitPriority('never')
      policy.setCueGroupSelectionMode('oncePerSong')
      policy.onSongStart()
      policy.selectCue(CueType.Chorus)

      policy.reset()

      expect(policy.getCueConsistencyWindow()).toBe(1234)
      expect(policy.getStageKitPriority()).toBe('prefer-for-tracked')
      expect(policy.roleSnapshots().lastPrimaryCue).toMatchObject({ name: null, counter: 0 })
      expect(policy.getConsistencyStatus().trackedCues).toHaveLength(0)
    })
  })
})
