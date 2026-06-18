import { AudioGameModeManager } from '../../processors/AudioGameModeManager'
import type { AudioCueType } from '../../cues/types/audioCueTypes'
import type { AudioGameModeConfig } from '../../listeners/Audio/AudioTypes'

// Mutable registry stub controlled per-test.
const cueStyles: Record<string, 'primary' | 'secondary' | 'strobe'> = {
  'audio-a': 'primary',
  'audio-b': 'primary',
  'audio-c': 'primary',
  'audio-strobe': 'strobe',
}
let availableTypes: AudioCueType[] = []

jest.mock('../../cues/registries/AudioCueRegistry', () => ({
  AudioCueRegistry: {
    getInstance: () => ({
      getAvailableCueTypes: (): AudioCueType[] => availableTypes,
      getCueImplementation: (t: string) => (cueStyles[t] ? { style: cueStyles[t] } : null),
    }),
  },
}))

const config: AudioGameModeConfig = { enabled: true, cueDurationMin: 5, cueDurationMax: 10 }

describe('AudioGameModeManager.ensureValidPrimary', () => {
  beforeEach(() => {
    availableTypes = ['audio-a', 'audio-b', 'audio-strobe']
  })

  it('leaves the running cue and dwell timer untouched when it is still eligible', () => {
    const mgr = new AudioGameModeManager(config)
    const onSwitch = jest.fn()
    let lastDeadline: number | null = null
    mgr.setOnCueSwitch(onSwitch)
    mgr.setOnScheduleChange((info) => {
      lastDeadline = info.deadlineMs
    })
    mgr.start()
    const running = mgr.getActivePrimaryCue()
    const deadlineAfterStart = lastDeadline
    expect(['audio-a', 'audio-b']).toContain(running)
    onSwitch.mockClear()

    mgr.ensureValidPrimary()

    expect(mgr.getActivePrimaryCue()).toBe(running) // cue unchanged
    expect(onSwitch).not.toHaveBeenCalled() // no re-roll
    expect(lastDeadline).toBe(deadlineAfterStart) // dwell timer not rescheduled
  })

  it('re-rolls when the running cue is no longer eligible', () => {
    const mgr = new AudioGameModeManager(config)
    mgr.start()
    expect(['audio-a', 'audio-b']).toContain(mgr.getActivePrimaryCue())

    // Only audio-c is now eligible (and it is not the current cue).
    availableTypes = ['audio-c']
    const onSwitch = jest.fn()
    mgr.setOnCueSwitch(onSwitch)

    mgr.ensureValidPrimary()

    expect(mgr.getActivePrimaryCue()).toBe('audio-c')
    expect(onSwitch).toHaveBeenCalledWith('audio-c')
  })
})
