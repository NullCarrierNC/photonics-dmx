import { describe, expect, it, jest } from '@jest/globals'
import { AudioFrameDriver } from '../../sim/AudioFrameDriver'
import type { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'

function driver() {
  const handleAudioData = jest.fn(async (..._args: unknown[]) => {})
  const onBeat = jest.fn()
  const frames = new AudioFrameDriver(
    { handleAudioData } as unknown as AudioCueHandler,
    () => ({ cue: 'c', secondary: null, strobe: null, bpm: 120, level: 0.5 }),
    onBeat,
  )
  return { frames, handleAudioData, onBeat }
}

describe('AudioFrameDriver', () => {
  it('raises a beat on the sequencer for a beat frame, as the audio processor does', async () => {
    const { frames, handleAudioData, onBeat } = driver()

    await frames.dispatch({ beat: 'Strong' })

    expect(onBeat).toHaveBeenCalledTimes(1)
    expect(handleAudioData).toHaveBeenCalledWith(
      expect.objectContaining({ beatDetected: true }),
      expect.anything(),
      'c',
      null,
      null,
      expect.any(Number),
      false,
    )
  })

  it('hands a beat frame to the cues before it raises the beat', async () => {
    const { frames, handleAudioData, onBeat } = driver()

    await frames.dispatch({ beat: 'Strong' })

    expect(handleAudioData.mock.invocationCallOrder[0]).toBeLessThan(
      onBeat.mock.invocationCallOrder[0],
    )
  })

  it('raises no beat for a plain frame', async () => {
    const { frames, onBeat } = driver()

    await frames.dispatch({})

    expect(onBeat).not.toHaveBeenCalled()
  })
})
