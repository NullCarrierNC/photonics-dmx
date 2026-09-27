import { describe, expect, it } from '@jest/globals'
import { rigFiles, scenarioProblems } from '../../wireCheck/wireScenario'
import { applyFrameEvent, levelAt, stageKitBytes } from '../../../photonics-dmx/sim/wire/playStep'
import type { CueData } from '../../../photonics-dmx/cues/types/cueTypes'
import { DrumNoteType, InstrumentNoteType } from '../../../photonics-dmx/cues/types/cueTypes'

interface WrittenRig {
  rigs: Array<{
    config: {
      lightLayout: object
      frontLights: object[]
      backLights: object[]
      strobeLights: object[]
    }
  }>
}

describe('wire scenarios', () => {
  it('lists what stops a scenario from running', () => {
    expect(scenarioProblems('nope')).toEqual(['a scenario must be an object'])
    expect(
      scenarioProblems({
        name: '',
        files: {},
        rig: { templates: [], lights: [] },
        steps: [{ type: 'dance' }, { type: 'yarg', durationMs: 0 }],
      }),
    ).toEqual([
      'name must be a non-empty string',
      'give exactly one of files and rig',
      'steps[0].type must be one of yarg, audio, rb3, idle, saveTemplates',
      'steps[1].durationMs must be above 0',
    ])
    expect(scenarioProblems({ name: 'x', files: {}, steps: [] })).toEqual([
      'steps must be a non-empty list',
    ])
    expect(
      scenarioProblems({ name: 'x', files: {}, steps: [{ type: 'saveTemplates', templates: [] }] }),
    ).toEqual([])
  })

  it('places each light at its address by the template offsets, with unassigned channels at 0', () => {
    const files = rigFiles({
      strobeType: 'AllCapable',
      templates: [
        {
          id: 'par',
          fixture: 'rgb',
          channels: { masterDimmer: 2, red: 3, green: 4, blue: 5, strobeChannel: 0 },
        },
      ],
      lights: [
        { id: 'F', template: 'par', group: 'front', address: 1 },
        { id: 'B', template: 'par', group: 'back', address: 10, strobe: true },
      ],
    })
    const written: WrittenRig = JSON.parse(JSON.stringify(files['dmxRigs.json']))
    const { config } = written.rigs[0]
    expect(config.lightLayout).toEqual({ id: 'front-back', label: 'Front and back' })
    expect(config.frontLights).toEqual([
      expect.objectContaining({
        id: 'F',
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 0 },
      }),
    ])
    expect(config.backLights).toEqual([
      expect.objectContaining({ id: 'B', channels: expect.objectContaining({ masterDimmer: 10 }) }),
    ])
    expect(config.strobeLights).toEqual([expect.objectContaining({ id: 'B' })])
  })

  it('puts a strobe-row light in the strobe row only, as a strobe', () => {
    const files = rigFiles({
      strobeType: 'Dedicated',
      templates: [{ id: 'par', fixture: 'rgb', channels: { masterDimmer: 1, red: 2 } }],
      lights: [
        { id: 'F', template: 'par', group: 'front', address: 1 },
        { id: 'S', template: 'par', group: 'strobe', address: 5 },
      ],
    })
    const written: WrittenRig = JSON.parse(JSON.stringify(files['dmxRigs.json']))
    const { config } = written.rigs[0]
    expect(config.frontLights).toHaveLength(1)
    expect(config.backLights).toEqual([])
    expect(config.lightLayout).toEqual({ id: 'front', label: 'Front only' })
    expect(config.strobeLights).toEqual([
      expect.objectContaining({ id: 'S', isStrobeEnabled: true }),
    ])
  })

  it('refuses a light whose template is not listed', () => {
    expect(() =>
      rigFiles({
        templates: [],
        lights: [{ id: 'A', template: 'gone', group: 'front', address: 1 }],
      }),
    ).toThrow("Light A names template 'gone', which is not listed")
  })

  it('sets the frame fields a YARG event names, and carries the vocal state', () => {
    const frame: Partial<CueData> = {}
    expect(applyFrameEvent('drum-red', frame, false)).toBe(false)
    expect(applyFrameEvent('drum-kick', frame, false)).toBe(false)
    applyFrameEvent('guitar-blue', frame, false)
    applyFrameEvent('bass-green', frame, false)
    applyFrameEvent('keys-open', frame, false)
    applyFrameEvent('keyframe-previous', frame, false)
    expect(frame).toEqual({
      drumNotes: [DrumNoteType.RedDrum, DrumNoteType.Kick],
      guitarNotes: [InstrumentNoteType.Blue],
      bassNotes: [InstrumentNoteType.Green],
      keysNotes: [InstrumentNoteType.Open],
      keyframe: 'Previous',
    })
    expect(applyFrameEvent('vocal-note', frame, false)).toBe(true)
    expect(applyFrameEvent('drum-red', frame, true)).toBe(true)
    expect(applyFrameEvent('vocal-note-off', frame, true)).toBe(false)
    expect(() => applyFrameEvent('drum-cowbell', frame, false)).toThrow(
      "Unknown YARG event 'drum-cowbell'",
    )
  })

  it('writes StageKit commands as the datagram bytes RB3E sends', () => {
    expect(stageKitBytes({ atMs: 0, bank: 'red', leds: 0b1111 })).toEqual([15, 0x80])
    expect(stageKitBytes({ atMs: 0, bank: 'blue', leds: 0x1ff })).toEqual([0xff, 0x20])
    expect(stageKitBytes({ atMs: 0, strobe: 'fast' })).toEqual([0, 0x05])
    expect(stageKitBytes({ atMs: 0, strobe: 'off' })).toEqual([0, 0x07])
    expect(stageKitBytes({ atMs: 0, fog: true })).toEqual([0, 0x01])
  })

  it('reads an audio level as steady, cycled or every Nth frame', () => {
    expect(levelAt(0.4, 7)).toBe(0.4)
    expect([0, 1, 2, 3].map((i) => levelAt([0.1, 0.2, 0.3], i))).toEqual([0.1, 0.2, 0.3, 0.1])
    expect(levelAt([], 3)).toBe(0)
    expect([0, 1, 2, 3].map((i) => levelAt({ every: 3, high: 0.8, low: 0 }, i))).toEqual([
      0.8, 0, 0, 0.8,
    ])
  })
})
