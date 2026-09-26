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

/** The v0.5.5-alpha.5 alt1 library as a user's copy of it, which a load brings forward. */
function olderCueFileText(groupId: string): string {
  const file = JSON.parse(
    fs.readFileSync(path.join(HISTORICAL, 'v0.5.5-alpha.5', 'yarg-alt1.json'), 'utf-8'),
  )
  file.bundled = false
  file.group = { ...file.group, id: groupId, name: groupId, isDefault: false }
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
