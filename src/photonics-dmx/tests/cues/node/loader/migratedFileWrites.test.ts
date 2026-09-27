import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeCueLoader } from '../../../../cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../../../cues/node/loader/EffectLoader'
import { CueRegistry } from '../../../../cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../../cues/registries/AudioCueRegistry'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import type { NodeCueFile } from '../../../../cues/types/nodeCueTypes'

jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, writeFile: jest.fn(actual.writeFile) }
})

const writeFileMock = jest.mocked(fsPromises.writeFile)
const realWriteFile = jest.requireActual<typeof import('fs/promises')>('fs/promises').writeFile

const HISTORICAL = path.join(__dirname, '../../../historical')

/** A disk that fills partway through the next write: half the contents land, then it fails. */
function fillDiskPartway(): void {
  writeFileMock.mockImplementationOnce(async (target, data) => {
    await realWriteFile(target, String(data).slice(0, String(data).length / 2))
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  })
}

interface GraphJson {
  name: string
  cueType?: string
  nodes: { actions: Array<{ timing: { easing?: { source: string; value: unknown } } }> }
  variables?: Array<Record<string, unknown>>
}

interface LibraryJson {
  bundled?: boolean
  version: number
  group: Record<string, unknown>
  cues: GraphJson[]
  effects: GraphJson[]
}

/** The v0.5.5-alpha.5 alt1 library as a user's copy of it, which a load brings forward. */
function olderCueFile(groupId: string): LibraryJson {
  const file: LibraryJson = JSON.parse(
    fs.readFileSync(path.join(HISTORICAL, 'v0.5.5-alpha.5', 'yarg-alt1.json'), 'utf-8'),
  )
  file.bundled = false
  file.group = { ...file.group, id: groupId, name: groupId, isDefault: false }
  return file
}

const olderCueFileText = (groupId: string): string => JSON.stringify(olderCueFile(groupId), null, 2)

/** The alt1 copy with an easing this build does not know, as a newer build would write it. */
function newerCueFileText(groupId: string): string {
  const file = olderCueFile(groupId)
  const harmony = file.cues.find((cue) => cue.cueType === 'Harmony')
  if (!harmony) throw new Error('the library has no Harmony cue')
  harmony.nodes.actions[0].timing.easing = { source: 'literal', value: 'springOut' }
  return JSON.stringify(file, null, 2)
}

describe('writing back cue and effect files a load brings forward', () => {
  let baseDir: string
  let cuesDir: string
  let effectsDir: string
  let yarg: CueRegistry
  let effectLoader: EffectLoader
  let loader: NodeCueLoader

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrated-file-writes-'))
    cuesDir = path.join(baseDir, 'node-data', 'cues', 'yarg')
    effectsDir = path.join(baseDir, 'node-data', 'effects', 'yarg')
    fs.mkdirSync(cuesDir, { recursive: true })
    fs.mkdirSync(effectsDir, { recursive: true })
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
    for (const dir of [cuesDir, effectsDir]) {
      fs.chmodSync(dir, 0o755)
      for (const name of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, name), 0o644)
    }
    fs.rmSync(baseDir, { recursive: true, force: true })
    writeFileMock.mockReset()
    writeFileMock.mockImplementation(realWriteFile)
    jest.restoreAllMocks()
  })

  describe('when the disk fills partway through the write-back', () => {
    it('keeps an older cue file whole and still loads it', async () => {
      const filePath = path.join(cuesDir, 'user-alt1.json')
      const original = olderCueFileText('user-alt1')
      fs.writeFileSync(filePath, original)
      fillDiskPartway()

      const result = await loader.loadAll()

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(fs.readdirSync(cuesDir)).toEqual(['user-alt1.json'])
      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
      expect(yarg.getGroup('user-alt1')?.cues.size).toBe(24)
    })

    it('keeps an older effect file whole and still loads it', async () => {
      const filePath = path.join(effectsDir, 'my-effects.json')
      const original = fs.readFileSync(
        path.join(HISTORICAL, 'f3f851db', 'my-effects.json'),
        'utf-8',
      )
      fs.writeFileSync(filePath, original)
      fillDiskPartway()

      const result = await effectLoader.loadAll()

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(fs.readdirSync(effectsDir)).toEqual(['my-effects.json'])
      expect(result).toEqual(expect.objectContaining({ loaded: 1, failed: 0 }))
    })
  })

  describe('when the write-back fails', () => {
    it('reports a read-only older file as unsaved on every load, never as saved', async () => {
      const filePath = path.join(cuesDir, 'user-alt1.json')
      const original = olderCueFileText('user-alt1')
      fs.writeFileSync(filePath, original)
      fs.chmodSync(filePath, 0o444)

      const firstLaunch = await loader.loadAll()
      await loader.dispose()
      const secondLaunch = await new NodeCueLoader({
        baseDir,
        registries: { yarg, rb3: CueRegistry.create(), audio: AudioCueRegistry.getInstance() },
        effectLoader,
        runtimeBroadcaster: noopRuntimeBroadcaster(),
      }).loadAll()

      for (const launch of [firstLaunch, secondLaunch]) {
        expect(launch).toEqual(
          expect.objectContaining({
            loaded: 1,
            migrations: [],
            unsaved: [
              expect.stringMatching(
                /^user-alt1\.json: Could not save the update from an older version \(EACCES\), so each load updates it again: .*'sin-out'/,
              ),
            ],
          }),
        )
      }
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(yarg.getGroup('user-alt1')?.cues.size).toBe(24)
    })

    it('reports an older effect file in a read-only folder as unsaved', async () => {
      const filePath = path.join(effectsDir, 'my-effects.json')
      fs.copyFileSync(path.join(HISTORICAL, 'f3f851db', 'my-effects.json'), filePath)
      fs.chmodSync(effectsDir, 0o555)

      const result = await effectLoader.loadAll()

      expect(result).toEqual(
        expect.objectContaining({
          loaded: 1,
          migrations: [],
          unsaved: [
            expect.stringMatching(/^my-effects\.json: Could not save .*\(EACCES\).*'beat-count'/),
          ],
        }),
      )
      const [summary] = effectLoader.getSummary().yarg
      expect(summary).toEqual(
        expect.objectContaining({ migrations: undefined, unsaved: [expect.any(String)] }),
      )
    })
  })

  describe('a file holding values this version does not know', () => {
    it('leaves a cue file as it is on disk and loads it as this version reads it', async () => {
      const filePath = path.join(cuesDir, 'newer.json')
      const original = newerCueFileText('newer')
      fs.writeFileSync(filePath, original)

      const result = await loader.loadAll()

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(result).toEqual(
        expect.objectContaining({
          loaded: 1,
          failed: 0,
          migrations: [],
          unsaved: [
            "newer.json: Holds values this version does not know and is left as it is on disk: Easing 'springOut' in 'Harmony' is not one this version knows and plays as sinInOut. Unknown easing 'sin-out' in 'Harmony' now reads sinInOut.",
          ],
        }),
      )
      expect(yarg.getGroup('newer')?.cues.size).toBe(24)
    })

    it('leaves an effect file as it is on disk and loads it', async () => {
      const filePath = path.join(effectsDir, 'my-effects.json')
      const file: LibraryJson = JSON.parse(
        fs.readFileSync(path.join(HISTORICAL, 'f3f851db', 'my-effects.json'), 'utf-8'),
      )
      file.effects[0].nodes.actions[0].timing.easing = { source: 'literal', value: 'springOut' }
      const original = JSON.stringify(file, null, 2)
      fs.writeFileSync(filePath, original)

      const result = await effectLoader.loadAll()

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(result).toEqual(
        expect.objectContaining({
          loaded: 1,
          migrations: [],
          unsaved: [
            expect.stringMatching(
              /^my-effects\.json: Holds values this version does not know .*'springOut' in 'Flash Colour'.*'beat-count'/,
            ),
          ],
        }),
      )
      expect((await effectLoader.readEffectFilesByGroupId('yarg')).has('my-effects')).toBe(true)
    })

    it('leaves a file with a blend mode this version does not know as it is and flags the cue', async () => {
      const filePath = path.join(cuesDir, 'newer.json')
      const file = olderCueFile('newer')
      const harmony = file.cues.find((cue) => cue.cueType === 'Harmony')
      Object.assign(harmony?.nodes.actions[0] ?? {}, {
        color: {
          name: { source: 'literal', value: 'red' },
          brightness: { source: 'literal', value: 'max' },
          blendMode: { source: 'literal', value: 'screen' },
        },
      })
      const original = JSON.stringify(file, null, 2)
      fs.writeFileSync(filePath, original)

      const result = await loader.loadAll()

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
      expect(result).toEqual(
        expect.objectContaining({
          loaded: 1,
          migrations: [],
          unsaved: [
            expect.stringMatching(
              /^newer\.json: Holds values .* Blend mode 'screen' in 'Harmony' is not one this version knows\./,
            ),
          ],
        }),
      )
      const [summary] = loader.getSummary().yarg
      expect(summary.errors).toEqual([expect.stringContaining('screen')])
    })

    it('refuses a file of a newer file version and leaves it as it is', async () => {
      const filePath = path.join(cuesDir, 'newer.json')
      const original = JSON.stringify({ ...olderCueFile('newer'), version: 2 }, null, 2)
      fs.writeFileSync(filePath, original)

      const result = await loader.loadAll()

      expect(result).toEqual(expect.objectContaining({ loaded: 0, failed: 1, migrations: [] }))
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
    })
  })

  describe('saving over a file', () => {
    it('keeps the file as it was when the disk fills partway through the save', async () => {
      const filePath = path.join(cuesDir, 'mine.json')
      fs.writeFileSync(filePath, olderCueFileText('mine'))
      await loader.loadAll()
      const loaded = fs.readFileSync(filePath, 'utf-8')
      const content = await loader.readFile(filePath)
      const edited: NodeCueFile = { ...content, group: { ...content.group, name: 'Renamed' } }
      fillDiskPartway()

      await expect(loader.saveFile('yarg', 'mine.json', edited)).rejects.toThrow('ENOSPC')

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(loaded)
      expect(fs.readdirSync(cuesDir)).toEqual(['mine.json'])
    })

    it('refuses a file the user made read-only', async () => {
      const filePath = path.join(cuesDir, 'mine.json')
      fs.writeFileSync(filePath, olderCueFileText('mine'))
      await loader.loadAll()
      const content = await loader.readFile(filePath)
      const loaded = fs.readFileSync(filePath, 'utf-8')
      fs.chmodSync(filePath, 0o444)

      await expect(loader.saveFile('yarg', 'mine.json', content)).rejects.toThrow('EACCES')

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(loaded)
    })
  })
})
