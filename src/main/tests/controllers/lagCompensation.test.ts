import { describe, expect, it } from '@jest/globals'
import { resolveLagCompensationMs } from '../../controllers/lagCompensation'

function sources(active: { rb3?: boolean; yarg?: boolean; audio?: boolean } = {}) {
  return {
    isRb3Enabled: () => active.rb3 ?? false,
    isYargEnabled: () => active.yarg ?? false,
    isAudioEnabled: () => active.audio ?? false,
  }
}

function prefs(video: unknown, audio: unknown) {
  return {
    getVideoLagCompensationMs: () => video,
    getAudioLagCompensationMs: () => audio,
  }
}

const VIDEO = 250
const AUDIO = 40

describe('resolveLagCompensationMs', () => {
  it('uses the video delay for RB3E and for YARG', () => {
    expect(resolveLagCompensationMs(sources({ rb3: true }), prefs(VIDEO, AUDIO))).toBe(VIDEO)
    expect(resolveLagCompensationMs(sources({ yarg: true }), prefs(VIDEO, AUDIO))).toBe(VIDEO)
  })

  it('uses the audio delay when audio is the only thing listening', () => {
    expect(resolveLagCompensationMs(sources({ audio: true }), prefs(VIDEO, AUDIO))).toBe(AUDIO)
  })

  it.each([
    ['RB3E', { rb3: true, audio: true }],
    ['YARG', { yarg: true, audio: true }],
  ])('keeps the video delay when audio runs alongside %s', (_label, active) => {
    // Precedence follows useCuePreviewInputPlatform: a listener owns the screen, so the value
    // calibrated against the screen is the one that applies.
    expect(resolveLagCompensationMs(sources(active), prefs(VIDEO, AUDIO))).toBe(VIDEO)
  })

  it('uses the video delay when nothing is listening', () => {
    // The Cue Simulator and the DMX Console drive the rig with no listener enabled, and both are
    // watched on a display.
    expect(resolveLagCompensationMs(sources(), prefs(VIDEO, AUDIO))).toBe(VIDEO)
  })

  it('reads an unusable stored delay as off', () => {
    expect(resolveLagCompensationMs(sources({ yarg: true }), prefs('fast', AUDIO))).toBe(0)
    expect(resolveLagCompensationMs(sources({ audio: true }), prefs(VIDEO, undefined))).toBe(0)
  })

  it('holds a stored delay past the ceiling inside the range', () => {
    expect(resolveLagCompensationMs(sources({ yarg: true }), prefs(9999, AUDIO))).toBe(500)
  })
})
