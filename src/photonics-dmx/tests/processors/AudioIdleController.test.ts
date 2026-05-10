import { describe, expect, it } from '@jest/globals'
import { AudioIdleController } from '../../processors/AudioIdleController'
import { DEFAULT_AUDIO_IDLE_DETECTION } from '../../listeners/Audio/AudioConfig'

const cfg = { ...DEFAULT_AUDIO_IDLE_DETECTION, thresholdPct: 20 }

describe('AudioIdleController', () => {
  it('stays active when game mode is off regardless of level', () => {
    const c = new AudioIdleController()
    expect(
      c.update({
        overallLevel: 0,
        gameModeActive: false,
        nowMs: 0,
        config: cfg,
      }),
    ).toBe(null)
    expect(c.getState()).toBe('active')
    expect(
      c.update({
        overallLevel: 0,
        gameModeActive: false,
        nowMs: 100_000,
        config: cfg,
      }),
    ).toBe(null)
    expect(c.getState()).toBe('active')
  })

  it('enters idle only after low energy sustained for minIdleSeconds', () => {
    const c = new AudioIdleController()
    expect(c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 0, config: cfg })).toBe(null)
    expect(c.getState()).toBe('pendingIdle')
    expect(c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 4999, config: cfg })).toBe(
      null,
    )
    expect(c.getState()).toBe('pendingIdle')
    expect(c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 5000, config: cfg })).toBe(
      'enter',
    )
    expect(c.getState()).toBe('idle')
  })

  it('resets pending idle if energy rises before min time', () => {
    const c = new AudioIdleController()
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 0, config: cfg })
    expect(c.getState()).toBe('pendingIdle')
    c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 2000, config: cfg })
    expect(c.getState()).toBe('active')
  })

  it('exits idle after high energy sustained for resumeSeconds', () => {
    const c = new AudioIdleController()
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 0, config: cfg })
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 5000, config: cfg })
    expect(c.getState()).toBe('idle')
    expect(c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 6000, config: cfg })).toBe(
      null,
    )
    expect(c.getState()).toBe('pendingResume')
    expect(c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 8999, config: cfg })).toBe(
      null,
    )
    expect(c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 9000, config: cfg })).toBe(
      'exit',
    )
    expect(c.getState()).toBe('active')
  })

  it('resets pending resume if energy dips below threshold before resumeSeconds', () => {
    const c = new AudioIdleController()
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 0, config: cfg })
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 5000, config: cfg })
    expect(c.getState()).toBe('idle')
    c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 6000, config: cfg })
    expect(c.getState()).toBe('pendingResume')
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 7000, config: cfg })
    expect(c.getState()).toBe('idle')
    c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 8000, config: cfg })
    expect(c.getState()).toBe('pendingResume')
    expect(c.update({ overallLevel: 0.25, gameModeActive: true, nowMs: 11_000, config: cfg })).toBe(
      'exit',
    )
    expect(c.getState()).toBe('active')
  })

  it('returns exit when idle detection disabled while idle', () => {
    const c = new AudioIdleController()
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 0, config: cfg })
    c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 5000, config: cfg })
    const off = { ...cfg, enabled: false }
    expect(c.update({ overallLevel: 0.05, gameModeActive: true, nowMs: 6000, config: off })).toBe(
      'exit',
    )
    expect(c.getState()).toBe('active')
  })
})
