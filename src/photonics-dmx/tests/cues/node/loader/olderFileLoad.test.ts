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

const HISTORICAL = path.join(__dirname, '../../../historical')
const BUNDLED_EFFECTS = path.resolve(
  __dirname,
  '../../../../../../resources/defaults/node-data/effects/yarg',
)

interface ValueSourceJson {
  source: string
  value?: unknown
  name?: string
}

interface VariableJson {
  name: string
  [field: string]: unknown
}

interface GraphJson {
  id: string
  name: string
  cueType?: string
  nodes: {
    actions: Array<{
      id: string
      color: { name: ValueSourceJson; blendMode: ValueSourceJson }
      timing: { duration: ValueSourceJson; easing?: ValueSourceJson }
    }>
  }
  variables?: VariableJson[]
}

/** The parts of a stored cue or effect library these cases read and edit. */
interface LibraryJson {
  bundled?: boolean
  group: { id: string; name: string; isDefault?: boolean; variables?: VariableJson[] }
  cues: GraphJson[]
  effects: GraphJson[]
}

const readHistorical = (release: string, file: string): LibraryJson =>
  JSON.parse(fs.readFileSync(path.join(HISTORICAL, release, file), 'utf-8'))

const writeJson = (filePath: string, data: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

const readJson = (filePath: string): LibraryJson => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

/** The v0.5.5-alpha.5 alt1 library, as a user's copy of it. */
function userCopyOfAlt1(groupId: string): LibraryJson {
  const file = readHistorical('v0.5.5-alpha.5', 'yarg-alt1.json')
  file.bundled = false
  file.group = { ...file.group, id: groupId, name: groupId, isDefault: false }
  return file
}

const cueOf = (file: LibraryJson, cueType: string): GraphJson => {
  const cue = file.cues.find((c) => c.cueType === cueType)
  if (!cue) throw new Error(`the library has no ${cueType} cue`)
  return cue
}

const dischordOf = (file: LibraryJson): GraphJson => cueOf(file, 'Dischord')

const effectOf = (file: LibraryJson, id: string): GraphJson => {
  const effect = file.effects.find((e) => e.id === id)
  if (!effect) throw new Error(`the library has no effect ${id}`)
  return effect
}

describe('loading cue and effect files older builds wrote', () => {
  let baseDir: string
  let yarg: CueRegistry
  let effectLoader: EffectLoader
  let loader: NodeCueLoader
  let cuesDir: string
  let effectsDir: string

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'older-file-load-'))
    cuesDir = path.join(baseDir, 'node-data', 'cues', 'yarg')
    effectsDir = path.join(baseDir, 'node-data', 'effects', 'yarg')
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

  describe('with the blend modes v0.5.5 offered and later builds retired', () => {
    beforeEach(() => {
      const multiply = userCopyOfAlt1('user-legacy')
      dischordOf(multiply).nodes.actions[0].color.blendMode = {
        source: 'literal',
        value: 'multiply',
      }
      writeJson(path.join(cuesDir, 'user-legacy.json'), multiply)

      const overlayOnly = userCopyOfAlt1('user-legacy-one')
      overlayOnly.cues = [dischordOf(overlayOnly)]
      overlayOnly.cues[0].nodes.actions[0].color.blendMode = { source: 'literal', value: 'overlay' }
      writeJson(path.join(cuesDir, 'user-legacy-one.json'), overlayOnly)

      const effects = readHistorical('v0.5.5-alpha.5', 'yarg-core-effects.json')
      effects.bundled = false
      effectOf(effects, 'effect-rotation-cw').nodes.actions[0].color.blendMode = {
        source: 'literal',
        value: 'overlay',
      }
      writeJson(path.join(effectsDir, 'user-core-effects.json'), effects)
    })

    it('registers every cue and effect with the retired modes read as replace', async () => {
      const effectResult = await effectLoader.loadAll()
      const cueResult = await loader.loadAll()

      expect(effectResult).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(cueResult).toEqual(expect.objectContaining({ loaded: 2, failed: 0 }))
      expect(yarg.getGroup('user-legacy')?.cues.size).toBe(24)
      expect(yarg.getGroup('user-legacy-one')?.cues.has(CueType.Dischord)).toBe(true)
      for (const summary of loader.getSummary().yarg) expect(summary.errors).toBeUndefined()
      const [effectSummary] = effectLoader.getSummary().yarg
      expect(effectSummary).toEqual(expect.objectContaining({ effectCount: 8, errors: undefined }))

      const onDisk = readJson(path.join(cuesDir, 'user-legacy.json'))
      expect(dischordOf(onDisk).nodes.actions[0].color.blendMode.value).toBe('replace')
      const effectsOnDisk = readJson(path.join(effectsDir, 'user-core-effects.json'))
      const rotation = effectOf(effectsOnDisk, 'effect-rotation-cw')
      expect(rotation.nodes.actions[0].color.blendMode.value).toBe('replace')
    })

    it('reports the rewrite on the first load only', async () => {
      const firstEffects = await effectLoader.loadAll()
      const firstCues = await loader.loadAll()

      expect(firstEffects.migrations).toEqual([
        expect.stringMatching(/^user-core-effects\.json: .*Rotation Clockwise.*replace/),
      ])
      expect(firstCues.migrations).toEqual([
        expect.stringMatching(/^user-legacy-one\.json: .*Dischord.*replace/),
        expect.stringMatching(/^user-legacy\.json: .*Dischord.*replace/),
        expect.stringMatching(/^user-legacy\.json: .*'sin-out'.*Harmony/),
      ])

      expect((await effectLoader.loadAll()).migrations).toEqual([])
      expect((await loader.loadAll()).migrations).toEqual([])
    })
  })

  describe('with an easing name no build offered', () => {
    it('loads Harmony from v0.5.5 with its sin-out easing read as sinInOut', async () => {
      writeJson(path.join(cuesDir, 'user-alt1.json'), userCopyOfAlt1('user-alt1'))

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-alt1')?.cues.has(CueType.Harmony)).toBe(true)
      expect(result.migrations).toEqual([
        expect.stringMatching(/^user-alt1\.json: .*'sin-out'.*Harmony.*sinInOut/),
      ])
      const harmony = cueOf(readJson(path.join(cuesDir, 'user-alt1.json')), 'Harmony')
      const easings = harmony.nodes.actions.map((action) => action.timing.easing?.value)
      expect(easings).toEqual(['sinInOut', 'sinInOut'])
    })
  })

  describe('with initial values that do not fit their variable type', () => {
    it('loads every cue and stores each value as the runtime reads it', async () => {
      const file = userCopyOfAlt1('user-initials')
      dischordOf(file).variables = [
        ...(dischordOf(file).variables ?? []),
        { name: 'armed', type: 'boolean', scope: 'cue', initialValue: 'true' },
        { name: 'steps', type: 'number', scope: 'cue', initialValue: '4' },
      ]
      writeJson(path.join(cuesDir, 'user-initials.json'), file)

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-initials')?.cues.size).toBe(24)
      expect(result.migrations).toEqual(
        expect.arrayContaining([expect.stringMatching(/^user-initials\.json: .*'armed'.*'steps'/)]),
      )
      const stored = dischordOf(readJson(path.join(cuesDir, 'user-initials.json'))).variables
      expect(Object.fromEntries((stored ?? []).map((v) => [v.name, v.initialValue]))).toEqual(
        expect.objectContaining({ armed: true, steps: 4 }),
      )
    })

    it('keeps colours this version does not know in the file and warns about each', async () => {
      const file = userCopyOfAlt1('user-colours')
      dischordOf(file).variables = [
        ...(dischordOf(file).variables ?? []),
        { name: 'palette', type: 'color-array', scope: 'cue', initialValue: ['red', 'Bleu'] },
        { name: 'accent', type: 'color', scope: 'cue', initialValue: 'mauve' },
      ]
      const filePath = path.join(cuesDir, 'user-colours.json')
      writeJson(filePath, file)

      const first = await loader.loadAll()
      const stored = fs.readFileSync(filePath, 'utf-8')
      const second = await loader.loadAll()

      expect(first).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(second.migrations).toEqual([])
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(stored)
      const variables = dischordOf(JSON.parse(stored)).variables ?? []
      expect(Object.fromEntries(variables.map((v) => [v.name, v.initialValue]))).toEqual(
        expect.objectContaining({ palette: ['red', 'Bleu'], accent: 'mauve' }),
      )
      expect(yarg.getGroup('user-colours')?.cues.size).toBe(24)
      const [summary] = loader.getSummary().yarg
      expect(summary.warnings).toEqual(
        expect.arrayContaining([
          "cue 'Dischord': variable 'palette' initial value 'Bleu' is not a known Color and the list plays without it.",
          "cue 'Dischord': variable 'accent' initial value 'mauve' is not a known Color and plays as blue.",
        ]),
      )
    })
  })

  describe('with a raiser parameter bound to a variable of another type', () => {
    it('keeps a v0.5.5 Dischord raising the core effects this build ships, and warns', async () => {
      writeJson(path.join(cuesDir, 'user-alt1.json'), userCopyOfAlt1('user-alt1'))
      fs.mkdirSync(effectsDir, { recursive: true })
      fs.copyFileSync(
        path.join(BUNDLED_EFFECTS, 'yarg-core-effects.json'),
        path.join(effectsDir, 'yarg-core-effects.json'),
      )

      await effectLoader.loadAll()
      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-alt1')?.cues.has(CueType.Dischord)).toBe(true)
      const [summary] = loader.getSummary().yarg
      expect(summary.warnings).toEqual([
        "cue 'Dischord': effect raiser 'y1-dischord-blue' parameter 'lights': 'allLights' is a light-array variable, and this field takes string.",
      ])
    })
  })

  describe('with a variable name the editor accepted and the schema refuses', () => {
    it('loads an effect file the editor saved with beat-count, keeping every effect', async () => {
      fs.mkdirSync(effectsDir, { recursive: true })
      fs.copyFileSync(
        path.join(HISTORICAL, 'f3f851db', 'my-effects.json'),
        path.join(effectsDir, 'my-effects.json'),
      )

      const result = await effectLoader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(result.migrations).toEqual([
        expect.stringMatching(/^my-effects\.json: .*'beat-count'.*'beat_count'/),
      ])
      const [summary] = effectLoader.getSummary().yarg
      expect(summary).toEqual(expect.objectContaining({ effectCount: 11, errors: undefined }))
      expect((await effectLoader.readEffectFilesByGroupId('yarg')).has('my-effects')).toBe(true)
      const opened = await effectLoader.readFile(path.join(effectsDir, 'my-effects.json'))
      expect(opened.effects).toHaveLength(11)
      const stored = readJson(path.join(effectsDir, 'my-effects.json'))
      const names = (stored.effects[0].variables ?? []).map((v) => v.name)
      expect(names).toContain('beat_count')
      expect(names).not.toContain('beat-count')
    })

    it('loads a cue file whose group variable name has a dash, and renames its uses', async () => {
      const file = userCopyOfAlt1('user-vars')
      file.group.variables = [
        { name: 'fade-ms', type: 'number', scope: 'cue-group', initialValue: 0 },
      ]
      const dischord = dischordOf(file)
      dischord.nodes.actions[0].timing.duration = { source: 'variable', name: 'fade-ms' }
      writeJson(path.join(cuesDir, 'user-vars.json'), file)

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-vars')?.cues.size).toBe(24)
      const onDisk = readJson(path.join(cuesDir, 'user-vars.json'))
      expect(onDisk.group.variables?.[0].name).toBe('fade_ms')
      expect(dischordOf(onDisk).nodes.actions[0].timing.duration).toEqual({
        source: 'variable',
        name: 'fade_ms',
      })
    })
  })
})
