import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeCueLoader } from '../../../../cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../../../cues/node/loader/EffectLoader'
import { CueRegistry } from '../../../../cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../../cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import { CueType } from '../../../../cues/types/cueTypes'

const literal = (value: unknown) => ({ source: 'literal', value })

/** A graph that runs `logic` on each beat and lights the front with the colour in `tint`. */
const graph = (logic: Record<string, unknown>) => ({
  nodes: {
    events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
    actions: [
      {
        id: 'action-1',
        type: 'action',
        effectType: 'set-color',
        target: { groups: literal('front'), filter: literal('all') },
        color: { name: { source: 'variable', name: 'tint' }, brightness: literal('medium') },
        timing: {
          waitForCondition: literal('none'),
          waitForTime: literal(0),
          duration: literal(200),
          waitUntilCondition: literal('none'),
          waitUntilTime: literal(0),
        },
      },
    ],
    logic: [{ id: 'logic-1', type: 'logic', ...logic }],
  },
  connections: [
    { from: 'event-1', to: 'logic-1' },
    { from: 'logic-1', to: 'action-1' },
  ],
  variables: [{ name: 'tint', type: 'color', scope: 'cue', initialValue: 'red' }],
})

const cueFile = (logic: Record<string, unknown>) => ({
  version: 1,
  mode: 'yarg',
  group: { id: 'user-colours', name: 'User colours', isDefault: false },
  cues: [
    {
      id: 'chorus',
      name: 'Chorus',
      kind: 'lighting',
      cueType: CueType.Chorus,
      style: 'primary',
      ...graph(logic),
      layout: { nodePositions: {} },
    },
  ],
})

const effectFile = (logic: Record<string, unknown>) => ({
  version: 1,
  mode: 'yarg',
  group: { id: 'user-effects', name: 'User effects' },
  effects: [{ id: 'tinted', name: 'Tinted', mode: 'yarg', ...graph(logic) }],
})

const palettePick = {
  logicType: 'color-from-index',
  colors: literal(['red', 'mauve']),
  index: literal(0),
  assignTo: 'tint',
}

const tintSet = {
  logicType: 'variable',
  mode: 'set',
  varName: 'tint',
  valueType: 'color',
  value: literal('mauve'),
}

const tintCompare = {
  logicType: 'conditional',
  comparator: '==',
  left: { source: 'variable', name: 'tint' },
  right: literal('mauve'),
}

describe('loading a hand-edited file holding a colour this version does not know', () => {
  let baseDir: string
  let yarg: CueRegistry
  let effectLoader: EffectLoader
  let loader: NodeCueLoader

  /** Writes `data` as a stored file under `dir` and returns the text written. */
  const store = (dir: string, data: unknown): { filePath: string; text: string } => {
    const filePath = path.join(baseDir, 'node-data', dir, 'yarg', 'user.json')
    const text = JSON.stringify(data, null, 2)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, text)
    return { filePath, text }
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unknown-colour-load-'))
    yarg = CueRegistry.create()
    AudioCueRegistry.getInstance().reset()
    effectLoader = new EffectLoader({ baseDir })
    loader = new NodeCueLoader({
      baseDir,
      registries: { yarg, rb3: CueRegistry.create(), audio: AudioCueRegistry.getInstance() },
      effectLoader,
      runtimeBroadcaster: noopRuntimeBroadcaster(),
    })
  })

  afterEach(async () => {
    await loader.dispose()
    await effectLoader.dispose()
    AudioCueRegistry.getInstance().reset()
    fs.rmSync(baseDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  describe('in a palette', () => {
    it('loads the cue as it is on disk and warns once', async () => {
      const { filePath, text } = store('cues', cueFile(palettePick))

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-colours')?.cues.has(CueType.Chorus)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(text)
      expect(loader.getSummary().yarg[0].warnings).toEqual([
        "cue 'Chorus': color-from-index 'logic-1' colors 'mauve' is not a known Color and the list plays without it.",
      ])
    })

    it('loads the effect as it is on disk and warns once', async () => {
      const { filePath, text } = store('effects', effectFile(palettePick))

      const result = await effectLoader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(text)
      expect(effectLoader.getSummary().yarg[0].warnings).toEqual([
        "effect 'Tinted': color-from-index 'logic-1' colors 'mauve' is not a known Color and the list plays without it.",
      ])
    })
  })

  describe('as a logic node literal', () => {
    it('loads the cue as it is on disk and warns once', async () => {
      const { filePath, text } = store('cues', cueFile(tintSet))

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-colours')?.cues.has(CueType.Chorus)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(text)
      expect(loader.getSummary().yarg[0].warnings).toEqual([
        "cue 'Chorus': variable 'logic-1' value 'mauve' is not a known Color and plays as blue.",
      ])
    })

    it('loads the effect as it is on disk and warns once', async () => {
      const { filePath, text } = store('effects', effectFile(tintCompare))

      const result = await effectLoader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(text)
      expect(effectLoader.getSummary().yarg[0].warnings).toEqual([
        "effect 'Tinted': conditional 'logic-1' right 'mauve' is not a known Color and plays as blue.",
      ])
    })
  })
})
