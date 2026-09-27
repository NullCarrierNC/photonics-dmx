import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { WireScenario } from '../../wireCheck/wireScenario'

let mockAppData = ''

jest.mock('electron', () => ({
  app: { getPath: () => mockAppData, isPackaged: false },
}))

/* eslint-disable @typescript-eslint/no-require-imports -- imported after the electron mock */
const { runWireScenario } =
  require('../../wireCheck/runWireScenario') as typeof import('../../wireCheck/runWireScenario')
const { evaluate } = require('../../../../tools/wireCheckCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

jest.setTimeout(60000)

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }
const STROBE_VALUES = { slow: 64, medium: 128, fast: 192, fastest: 255 }

/** Two RGB PARs at 1 and 5 on the front row. */
const twoPars: WireScenario['rig'] = {
  templates: [{ id: 'par', fixture: 'rgb', channels: RGB }],
  lights: [
    { id: 'A', template: 'par', group: 'front', address: 1 },
    { id: 'B', template: 'par', group: 'front', address: 5 },
  ],
}

describe('runWireScenario', () => {
  beforeEach(() => {
    mockAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-scenario-'))
  })

  afterEach(() => {
    fs.rmSync(mockAppData, { recursive: true, force: true })
  })

  it('records Flare Slow as full white on both lights, and holds the expectation', async () => {
    const scenario: WireScenario = {
      name: 'flare',
      rig: twoPars,
      steps: [{ type: 'yarg', cue: 'Flare_Slow', durationMs: 500 }],
      channels: '1-12',
      expect: { states: [{ ch: { '1-8': 255, '9-12': 0 }, atMs: 0, holdMs: 400 }] },
    }
    const recording = await runWireScenario(scenario, mockAppData)

    expect(recording.sends.length).toBeGreaterThan(0)
    expect(recording.endMs).toBe(500)
    expect(recording.rigStarts[0].lights.map((light) => light.channels.masterDimmer)).toEqual([
      1, 5,
    ])
    const { check } = evaluate(scenario, recording)
    expect(check.lines).toEqual(['PASS state 1: reached at 0 ms'])
    expect(check.ok).toBe(true)
  })

  it('spaces changing sends by the 44 Hz output rate', async () => {
    const recording = await runWireScenario(
      {
        name: 'cool',
        rig: twoPars,
        steps: [{ type: 'yarg', cue: 'Cool_Automatic', durationMs: 2000 }],
      },
      mockAppData,
    )
    const gaps = recording.sends.slice(1).map((send, i) => send.ms - recording.sends[i].ms)
    expect(gaps.length).toBeGreaterThan(2)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1000 / 44 - 1)
  })

  it('drives a real strobe channel at the fast value while Strobe Fast runs', async () => {
    const scenario: WireScenario = {
      name: 'strobe',
      rig: {
        strobeType: 'AllCapable',
        templates: [
          {
            id: 'par-strobe',
            fixture: 'rgb',
            strobeValues: STROBE_VALUES,
            channels: { ...RGB, strobeChannel: 5 },
          },
        ],
        lights: [{ id: 'H', template: 'par-strobe', group: 'front', address: 1, strobe: true }],
      },
      steps: [
        { type: 'yarg', cue: 'Score', strobe: 'Strobe_Fast', durationMs: 500, mark: 'strobe' },
        { type: 'yarg', cue: 'Score', durationMs: 200, mark: 'off' },
      ],
      channels: '1-5',
      t0: 'mark:strobe',
      expect: {
        states: [
          { ch: { '5': 192 }, atMs: 10 },
          { ch: { '5': 0 }, atMs: 500 },
        ],
      },
    }
    const { check } = evaluate(scenario, await runWireScenario(scenario, mockAppData))
    expect(check.ok).toBe(true)
  })

  it('restarts the rig on the saved templates for a saveTemplates step', async () => {
    const recording = await runWireScenario(
      {
        name: 'save',
        rig: twoPars,
        steps: [
          { type: 'idle', durationMs: 100 },
          {
            type: 'saveTemplates',
            mark: 'saved',
            templates: [
              {
                id: 'par',
                position: 0,
                fixture: 'rgb',
                label: 'par',
                name: 'par',
                isStrobeEnabled: false,
                channels: { masterDimmer: 1, red: 3, green: 4, blue: 5 },
              },
            ],
          },
          { type: 'idle', durationMs: 100 },
        ],
      },
      mockAppData,
    )
    expect(recording.marks).toEqual({ saved: 100 })
    expect(recording.rigStarts.map((start) => start.atMs)).toEqual([0, 100])
    expect(recording.rigStarts[1].lights[1].channels).toMatchObject({ masterDimmer: 5, red: 7 })
  })

  it('plays a scenario-only audio cue laid over the bundled libraries', async () => {
    const setRed = {
      kind: 'lighting',
      id: 'red',
      cueTypeId: 'red',
      name: 'red',
      description: '',
      style: 'primary',
      nodes: {
        events: [{ id: 'ev', type: 'event', eventType: 'cue-called', triggerMode: 'edge' }],
        actions: [
          {
            id: 'set',
            type: 'action',
            effectType: 'set-color',
            target: {
              groups: { source: 'literal', value: 'front' },
              filter: { source: 'literal', value: 'all' },
            },
            color: {
              name: { source: 'literal', value: 'red' },
              brightness: { source: 'literal', value: 'max' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 0 },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: { source: 'literal', value: 0 },
            },
            layer: { source: 'literal', value: 1 },
          },
        ],
        logic: [],
      },
      connections: [{ from: 'ev', to: 'set' }],
      layout: { nodePositions: {} },
    }
    const scenario: WireScenario = {
      name: 'audio',
      rig: twoPars,
      audioLibrary: 'wire-test',
      cueFiles: {
        'cues/audio/wire-test.json': {
          version: 1,
          mode: 'audio',
          group: { id: 'wire-test', name: 'Wire test', description: '' },
          cues: [setRed],
        },
      },
      steps: [{ type: 'audio', cue: 'red', level: 0.5, durationMs: 300 }],
      channels: '1-8',
      expect: { states: [{ ch: { '1': 255, '2': 255, '3': 0, '5': 255, '6': 255 } }] },
    }
    const { check } = evaluate(scenario, await runWireScenario(scenario, mockAppData))
    expect(check.lines).toEqual([expect.stringMatching(/^PASS/)])
  })

  it('forwards each send to a real sender in real time, and not the closing blackout', async () => {
    const forwarded: Array<Record<number, number>> = []
    const recording = await runWireScenario(
      {
        name: 'forward',
        rig: twoPars,
        steps: [{ type: 'yarg', cue: 'Flare_Slow', durationMs: 150 }],
      },
      mockAppData,
      {
        forward: (buffer) => {
          forwarded.push({ ...buffer })
          return Promise.resolve(true)
        },
      },
    )
    expect(recording.endMs).toBeGreaterThanOrEqual(150)
    expect(Number.isInteger(recording.sends[0].ms)).toBe(true)
    expect(forwarded).toEqual(recording.sends.map((send) => send.buffer))
    expect(forwarded.at(-1)).toMatchObject({ 1: 255, 5: 255 })
  })

  it('raises a keyframe on the first frame at or after its time', async () => {
    const stomp = (events: Array<{ atMs: number; event: string }>): WireScenario => ({
      name: 'stomp',
      rig: twoPars,
      yargLibrary: 'yarg-alt1',
      steps: [{ type: 'yarg', cue: 'Stomp', durationMs: 400, events }],
    })
    const dark = await runWireScenario(stomp([]), mockAppData)
    expect(dark.sends.some((send) => Object.values(send.buffer).some((v) => v > 0))).toBe(false)
    const lit = await runWireScenario(stomp([{ atMs: 200, event: 'keyframe-next' }]), mockAppData)
    const firstLit = lit.sends.find((send) => Object.values(send.buffer).some((v) => v > 0))
    expect(firstLit?.ms).toBeGreaterThanOrEqual(200)
  })

  it('lights the LEDs a StageKit bank names through RB3 cue mode, and strobes on command', async () => {
    const scenario: WireScenario = {
      name: 'rb3',
      rb3Library: 'rb3-stagekit',
      rig: {
        strobeType: 'Dedicated',
        templates: [{ id: 'par', fixture: 'rgb', channels: RGB }],
        lights: [
          { id: 'A', template: 'par', group: 'front', address: 1 },
          { id: 'B', template: 'par', group: 'front', address: 5 },
          { id: 'S', template: 'par', group: 'strobe', address: 9 },
        ],
      },
      steps: [
        {
          type: 'rb3',
          durationMs: 1000,
          mark: 'start',
          stageKit: [
            { atMs: 0, bank: 'red', leds: 0b01 },
            { atMs: 500, strobe: 'fast' },
          ],
        },
      ],
      channels: '1-12',
      t0: 'mark:start',
      expect: {
        states: [
          { ch: { '2': 255, '3-4': 0, '5-8': 0 }, atMs: 60, holdMs: 400 },
          { ch: { '9-12': 255 }, atMs: 520 },
          { ch: { '9-12': 0 }, atMs: 560 },
        ],
      },
    }
    const { check } = evaluate(scenario, await runWireScenario(scenario, mockAppData))
    expect(check.lines.filter((line: string) => line.startsWith('FAIL'))).toEqual([])
  })

  it('maps StageKit LEDs straight onto the lights in RB3 direct mode', async () => {
    const scenario: WireScenario = {
      name: 'direct',
      rb3Mode: 'direct',
      rig: {
        templates: [{ id: 'par', fixture: 'rgb', channels: RGB }],
        lights: [0, 1, 2, 3].map((i) => ({
          id: `F${i + 1}`,
          template: 'par',
          group: 'front' as const,
          address: 4 * i + 1,
        })),
      },
      steps: [
        {
          type: 'rb3',
          durationMs: 600,
          mark: 'start',
          stageKit: [
            { atMs: 0, bank: 'red', leds: 0b0001 },
            { atMs: 300, bank: 'red', leds: 0b0100 },
          ],
        },
      ],
      channels: '1-16',
      t0: 'mark:start',
      expect: {
        states: [
          { ch: { '1': 100, '2': 255, '5-16': 0 }, atMs: 10 },
          { ch: { '1-8': 0, '9': 100, '10': 255 }, atMs: 310 },
        ],
      },
    }
    const { check } = evaluate(scenario, await runWireScenario(scenario, mockAppData))
    expect(check.lines.filter((line: string) => line.startsWith('FAIL'))).toEqual([])
  })

  const motionInputs: Array<[string, Omit<WireScenario, 'name' | 'rig'>]> = [
    [
      'audio',
      {
        audioLibrary: 'audio-stagekit',
        motion: { groupId: 'audio-motion-default', cueId: 'motion-cw-sync-slow' },
        steps: [
          { type: 'audio', cue: 'audio-sk-cool-auto', level: 0.6, bpm: 120, durationMs: 600 },
        ],
      },
    ],
    [
      'RB3 cue mode',
      {
        rb3Library: 'rb3-stagekit',
        motion: { groupId: 'rb3-motion-default', cueId: 'rb3-motion-cw-sync' },
        steps: [{ type: 'rb3', durationMs: 600, stageKit: [{ atMs: 0, bank: 'red', leds: 0xff }] }],
      },
    ],
  ]

  it.each(motionInputs)('runs the manual motion cue for %s input', async (_input, input) => {
    const heads: WireScenario['rig'] = {
      templates: [{ id: 'head', fixture: 'rgb/mh', channels: { ...RGB, pan: 5, tilt: 6 } }],
      lights: [{ id: 'H', template: 'head', group: 'front', address: 1 }],
    }
    const recording = await runWireScenario({ name: 'motion', rig: heads, ...input }, mockAppData)
    const pans = new Set(recording.sends.map((send) => send.buffer[5]))
    expect(pans.size).toBeGreaterThan(2)
  })

  it('refuses a scenario with no rig', async () => {
    await expect(
      runWireScenario({ name: 'empty', steps: [{ type: 'idle', durationMs: 10 }] }, mockAppData),
    ).rejects.toThrow("Scenario 'empty': give exactly one of files and rig")
  })
})
