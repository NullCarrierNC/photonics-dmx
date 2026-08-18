/**
 * The composite tees one cue stream to a primary runtime and a secondary consumer. These pin the
 * behaviours the split depends on: plain events reach both, a secondary look that wins its decision
 * suppresses the primary, control cues never gate on a stale decision, strobes follow the strobe
 * policy rather than the look decision, and the asymmetric methods stay asymmetric.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  CompositeCueRuntime,
  type SecondaryCueRuntime,
} from '../../cueHandlers/CompositeCueRuntime'
import type { CueRuntime } from '../../cueHandlers/CueRuntime'
import { CueType, defaultCueData } from '../../cues/types/cueTypes'

function makePrimary(): CueRuntime & { handleCue: jest.Mock } {
  return {
    notifySongStart: jest.fn(),
    notifySongEnd: jest.fn(),
    handleBeat: jest.fn(),
    handleMeasure: jest.fn(),
    handleKeyframeFirst: jest.fn(),
    handleKeyframeNext: jest.fn(),
    handleKeyframePrevious: jest.fn(),
    handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleDrumNote: jest.fn(),
    handleGuitarNote: jest.fn(),
    handleBassNote: jest.fn(),
    handleKeysNote: jest.fn(),
    handleVocalNote: jest.fn(),
    handleSongEvent: jest.fn(),
    requestMotionRepick: jest.fn(),
    stopActiveCue: jest.fn(),
    stopActiveStrobe: jest.fn(),
    resetSessionState: jest.fn(),
  } as unknown as CueRuntime & { handleCue: jest.Mock }
}

function makeSecondary(suppress = false): SecondaryCueRuntime & Record<string, jest.Mock> {
  return {
    handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopActiveCue: jest.fn(),
    getLastDispatchDecision: jest.fn(() => ({ plays: true, suppress })),
    rotateCueGroup: jest.fn(),
    notifySongStart: jest.fn(),
    handleBeat: jest.fn(),
  } as unknown as SecondaryCueRuntime & Record<string, jest.Mock>
}

describe('CompositeCueRuntime', () => {
  let primary: ReturnType<typeof makePrimary>
  let secondary: ReturnType<typeof makeSecondary>

  beforeEach(() => {
    primary = makePrimary()
    secondary = makeSecondary()
  })

  it('fans plain events to both consumers', () => {
    const composite = new CompositeCueRuntime(primary, secondary)
    composite.notifySongStart()
    composite.handleBeat()

    expect(primary.notifySongStart).toHaveBeenCalledTimes(1)
    expect(secondary.notifySongStart).toHaveBeenCalledTimes(1)
    expect(primary.handleBeat).toHaveBeenCalledTimes(1)
    expect(secondary.handleBeat).toHaveBeenCalledTimes(1)
  })

  it('runs both branches for a look when no suppress hook is wired', async () => {
    const composite = new CompositeCueRuntime(primary, secondary)
    await composite.handleCue(CueType.Frenzy, defaultCueData)

    expect(primary.handleCue).toHaveBeenCalledWith(CueType.Frenzy, defaultCueData)
    expect(secondary.handleCue).toHaveBeenCalledWith(CueType.Frenzy, defaultCueData)
  })

  it('suppresses the primary when the secondary wins its decision', async () => {
    const suppressPrimary = jest.fn<() => void>()
    const composite = new CompositeCueRuntime(primary, makeSecondary(true), { suppressPrimary })

    await composite.handleCue(CueType.Frenzy, defaultCueData)

    expect(suppressPrimary).toHaveBeenCalledTimes(1)
    expect(primary.handleCue).not.toHaveBeenCalled()
  })

  it('dispatches the primary when the secondary does not suppress', async () => {
    const suppressPrimary = jest.fn<() => void>()
    const composite = new CompositeCueRuntime(primary, makeSecondary(false), { suppressPrimary })

    await composite.handleCue(CueType.Frenzy, defaultCueData)

    expect(suppressPrimary).not.toHaveBeenCalled()
    expect(primary.handleCue).toHaveBeenCalledTimes(1)
  })

  it('never gates a control cue on the secondary decision', async () => {
    const suppressPrimary = jest.fn<() => void>()
    // Secondary reports suppress, but a blackout must still reach the primary.
    const composite = new CompositeCueRuntime(primary, makeSecondary(true), { suppressPrimary })

    await composite.handleCue(CueType.Blackout_Fast, defaultCueData)

    expect(suppressPrimary).not.toHaveBeenCalled()
    expect(primary.handleCue).toHaveBeenCalledWith(CueType.Blackout_Fast, defaultCueData)
  })

  it('lets the strobe policy decide whether the primary strobes', async () => {
    const composite = new CompositeCueRuntime(primary, secondary, {
      suppressPrimary: jest.fn<() => void>(),
      shouldPlayPrimaryStrobe: () => false,
    })

    await composite.handleCue(CueType.Strobe_Fast, defaultCueData)

    expect(secondary.handleCue).toHaveBeenCalledTimes(1)
    expect(primary.handleCue).not.toHaveBeenCalled()
  })

  it('holds and releases the mute overlay around a secondary strobe', async () => {
    const mutePrimary = jest.fn()
    const composite = new CompositeCueRuntime(primary, secondary, {
      mutePrimary,
      shouldMuteForSecondaryStrobe: () => true,
    })

    await composite.handleCue(CueType.Strobe_Fast, defaultCueData)
    expect(mutePrimary).toHaveBeenLastCalledWith(true)

    await composite.handleCue(CueType.Strobe_Off, defaultCueData)
    expect(mutePrimary).toHaveBeenLastCalledWith(false)
  })

  it('forwards the session-boundary methods to both consumers', () => {
    // The listener calls these on a fallback cue and at session boundaries. They are required on
    // CueRuntime precisely so a composite cannot drop them: as optional members a missing forward
    // compiles clean and silently stops nothing.
    const composite = new CompositeCueRuntime(primary, secondary)

    composite.stopActiveStrobe()
    expect(primary.stopActiveStrobe).toHaveBeenCalledTimes(1)
    expect(secondary.stopActiveCue).toHaveBeenCalledTimes(1)

    composite.resetSessionState()
    expect(primary.resetSessionState).toHaveBeenCalledTimes(1)
    expect(secondary.stopActiveCue).toHaveBeenCalledTimes(2)
  })

  it('lifts the mute overlay when the strobe is stopped outside handleCue', async () => {
    // Nothing dispatches Strobe_Off on this path, so without the lift the primary stays held black.
    const mutePrimary = jest.fn()
    const composite = new CompositeCueRuntime(primary, secondary, {
      mutePrimary,
      shouldMuteForSecondaryStrobe: () => true,
    })

    await composite.handleCue(CueType.Strobe_Fast, defaultCueData)
    expect(mutePrimary).toHaveBeenLastCalledWith(true)

    composite.stopActiveStrobe()
    expect(mutePrimary).toHaveBeenLastCalledWith(false)
  })

  it('keeps the two asymmetric methods asymmetric', () => {
    const composite = new CompositeCueRuntime(primary, secondary)

    // A group rotation re-picks the primary's motion and rotates the secondary's own group.
    composite.requestMotionRepick()
    expect(primary.requestMotionRepick).toHaveBeenCalledTimes(1)
    expect(secondary.rotateCueGroup).toHaveBeenCalledTimes(1)

    // Song events go to the primary only: the secondary has no sequencer consuming them.
    composite.handleSongEvent('led-3')
    expect(primary.handleSongEvent).toHaveBeenCalledWith('led-3')
  })

  it('stops the secondary when the feeding listener is disabled', () => {
    const composite = new CompositeCueRuntime(primary, secondary)
    composite.onDisable()
    expect(secondary.stopActiveCue).toHaveBeenCalledTimes(1)
  })

  it('lifts the mute overlay when the feeding listener is disabled', async () => {
    // Disabling mid-strobe ends the stream, so nothing arrives afterwards to release the overlay.
    const mutePrimary = jest.fn()
    const composite = new CompositeCueRuntime(primary, secondary, {
      mutePrimary,
      shouldMuteForSecondaryStrobe: () => true,
    })

    await composite.handleCue(CueType.Strobe_Fast, defaultCueData)
    expect(mutePrimary).toHaveBeenLastCalledWith(true)

    composite.onDisable()
    expect(mutePrimary).toHaveBeenLastCalledWith(false)
  })
})
