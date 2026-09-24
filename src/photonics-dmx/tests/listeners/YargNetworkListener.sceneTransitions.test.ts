import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener'
import type { CueRuntime } from '../../cueHandlers/CueRuntime'
import { CueData, CueType, defaultCueData } from '../../cues/types/cueTypes'

class MockCueHandler implements CueRuntime {
  public notifySongStart = jest.fn()
  public notifySongEnd = jest.fn()
  public handleBeat = jest.fn()
  public handleMeasure = jest.fn()
  public handleKeyframeFirst = jest.fn()
  public handleKeyframeNext = jest.fn()
  public handleKeyframePrevious = jest.fn()
  public handleCue = jest.fn(async (_cueType: CueType, _parameters: CueData): Promise<void> => {})
  public handleDrumNote = jest.fn()
  public handleGuitarNote = jest.fn()
  public handleBassNote = jest.fn()
  public handleKeysNote = jest.fn()
  public handleVocalNote = jest.fn()
  public stopActiveStrobe = jest.fn()
  public resetSessionState = jest.fn()
}

const frame = (currentScene: CueData['currentScene'], lightingCue: CueType): CueData => ({
  ...defaultCueData,
  currentScene,
  lightingCue,
})

describe('YargNetworkListener song start', () => {
  let runtime: MockCueHandler
  let listener: YargNetworkListener

  beforeEach(() => {
    runtime = new MockCueHandler()
    listener = new YargNetworkListener(runtime)
  })

  afterEach(async () => {
    await listener.shutdown()
  })

  it('starts a song on the first gameplay frame of a session, after a blackout', () => {
    listener.processCueData(frame('Gameplay', CueType.Verse))
    listener.processCueData(frame('Gameplay', CueType.Chorus))

    expect(runtime.notifySongStart).toHaveBeenCalledTimes(1)
    expect(runtime.handleCue.mock.calls[0][0]).toBe(CueType.Blackout_Fast)
    expect(runtime.handleCue.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.notifySongStart.mock.invocationCallOrder[0],
    )
  })

  it.each(['Menu', 'Score', 'Practice'] as const)(
    'starts a song when gameplay follows %s',
    (scene) => {
      listener.processCueData(frame(scene, CueType.Menu))
      listener.processCueData(frame('Gameplay', CueType.Verse))

      expect(runtime.notifySongStart).toHaveBeenCalledTimes(1)
      expect(runtime.handleCue).toHaveBeenCalledWith(CueType.Blackout_Fast, expect.anything())
    },
  )

  it('starts the song again on a retry from the score screen', () => {
    listener.processCueData(frame('Menu', CueType.Menu))
    listener.processCueData(frame('Gameplay', CueType.Verse))
    listener.processCueData(frame('Score', CueType.Score))
    listener.processCueData(frame('Gameplay', CueType.Verse))

    expect(runtime.notifySongStart).toHaveBeenCalledTimes(2)
    expect(runtime.notifySongEnd).toHaveBeenCalledTimes(1)
  })

  it('starts no song while a session opens outside gameplay', () => {
    listener.processCueData(frame('Menu', CueType.Menu))
    listener.processCueData(frame('Score', CueType.Score))

    expect(runtime.notifySongStart).not.toHaveBeenCalled()
  })
})
