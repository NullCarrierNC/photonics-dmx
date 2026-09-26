/**
 * EffectLoader: path resolution for IPC consumers (EXPORT etc.).
 * Equivalent NodeCueLoader coverage lives in ../NodeCueLoader.test.ts.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EffectLoader } from '../../../../cues/node/loader/EffectLoader'
import type { YargEffectFile } from '../../../../cues/types/nodeCueTypes'

function minimalYargEffectFixture(groupId: string): YargEffectFile {
  return {
    version: 1,
    mode: 'yarg',
    group: { id: groupId, name: 'G' },
    effects: [
      {
        id: 'eff-1',
        name: 'Test Effect',
        mode: 'yarg',
        nodes: {
          events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
          actions: [],
        },
        connections: [],
      },
    ],
  }
}

describe('EffectLoader.resolveEffectFilePathForIpc (used by EXPORT)', () => {
  let tmpDir: string
  let loader: EffectLoader

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-loader-'))
    loader = new EffectLoader({ baseDir: tmpDir })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns the rooted absolute path for a relative in-root path', () => {
    const yargDir = path.join(tmpDir, 'node-data', 'effects', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    const filename = 'export-target.json'
    fs.writeFileSync(path.join(yargDir, filename), '{}', 'utf-8')
    const rel = path.join('node-data', 'effects', 'yarg', filename)

    const resolved = loader.resolveEffectFilePathForIpc(rel)
    expect(resolved).toBe(path.resolve(yargDir, filename))
  })

  it('refuses a link inside an effect root that leads outside it', () => {
    const yargDir = path.join(tmpDir, 'node-data', 'effects', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-outside-'))
    try {
      fs.writeFileSync(path.join(outside, 'secret.json'), '{}', 'utf-8')
      fs.symlinkSync(outside, path.join(yargDir, 'linked'))

      expect(() =>
        loader.resolveEffectFilePathForIpc(
          path.join('node-data', 'effects', 'yarg', 'linked', 'secret.json'),
        ),
      ).toThrow(/must be under the YARG or audio effect directories/)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('rejects path traversal escaping the effect roots', () => {
    expect(() => loader.resolveEffectFilePathForIpc('../../etc/passwd')).toThrow(
      /must be under the YARG or audio effect directories/,
    )
  })

  it('rejects an absolute path outside the effect roots', () => {
    expect(() => loader.resolveEffectFilePathForIpc('/etc/passwd')).toThrow(
      /must be under the YARG or audio effect directories/,
    )
  })

  it('rejects empty input', () => {
    expect(() => loader.resolveEffectFilePathForIpc('')).toThrow(/required/)
  })

  it('rejects null-byte injection', () => {
    const yargDir = path.join(tmpDir, 'node-data', 'effects', 'yarg')
    const malicious = path.join(yargDir, 'a.json\0/etc/passwd')
    expect(() => loader.resolveEffectFilePathForIpc(malicious)).toThrow(/null bytes/)
  })
})

describe('EffectLoader.saveFile group id uniqueness', () => {
  let tmpDir: string
  let loader: EffectLoader

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-loader-save-'))
    loader = new EffectLoader({ baseDir: tmpDir })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rejects saving a second effect file with the same group.id on a different path', async () => {
    const minimal = minimalYargEffectFixture('dup-effect-group')
    await loader.saveFile('yarg', 'a.json', minimal)
    await expect(loader.saveFile('yarg', 'b.json', minimal)).rejects.toThrow(
      /already uses group id/,
    )
  })

  it('allows overwriting the same path with the same group.id', async () => {
    const minimal = minimalYargEffectFixture('same-effect-group')
    await loader.saveFile('yarg', 'only.json', minimal)
    await expect(loader.saveFile('yarg', 'only.json', minimal)).resolves.toMatchObject({
      success: true,
    })
  })

  it('refuses a create-only save over an existing file and leaves it as it was', async () => {
    await loader.saveFile('yarg', 'show.json', minimalYargEffectFixture('friday-show'))
    const target = path.join(tmpDir, 'node-data', 'effects', 'yarg', 'show.json')
    const before = fs.readFileSync(target, 'utf-8')

    await expect(
      loader.saveFile('yarg', 'show.json', minimalYargEffectFixture('show'), { createOnly: true }),
    ).rejects.toThrow(/already exists/)
    expect(fs.readFileSync(target, 'utf-8')).toBe(before)
  })
})

describe('EffectLoader folder mode', () => {
  let tmpDir: string
  let loader: EffectLoader
  let yargDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-loader-folder-'))
    loader = new EffectLoader({ baseDir: tmpDir })
    yargDir = path.join(tmpDir, 'node-data', 'effects', 'yarg')
    fs.mkdirSync(yargDir, { recursive: true })
    const audioFile = {
      ...minimalYargEffectFixture('misplaced'),
      mode: 'audio',
      effects: [{ ...minimalYargEffectFixture('misplaced').effects[0]!, mode: 'audio' }],
    }
    fs.writeFileSync(path.join(yargDir, 'pulse.json'), JSON.stringify(audioFile), 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('refuses to read a file whose mode is not its folder', async () => {
    await expect(loader.readFile(path.join(yargDir, 'pulse.json'))).rejects.toThrow(
      /Invalid effect file/,
    )
  })

  it('lists a file whose mode is not its folder with its errors', async () => {
    await loader.loadAll()

    const summary = loader.getSummary().yarg.find((s) => s.path.endsWith('pulse.json'))
    expect(summary?.errors?.join(' ')).toMatch(/mode/)
  })
})

describe('EffectLoader compile errors surface on the summary', () => {
  let tmpDir: string
  let loader: EffectLoader

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-loader-compile-'))
    loader = new EffectLoader({ baseDir: tmpDir })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('flags an effect that passes schema validation but fails to compile', async () => {
    // The minimal fixture validates but has no Effect Listener entry point, so compiling it
    // produces an error that the loader records on the file summary.
    await loader.saveFile('yarg', 'broken.json', minimalYargEffectFixture('grp-broken'))
    const summary = loader.getSummary().yarg.find((s) => s.path.endsWith('broken.json'))
    expect(summary?.errors?.length).toBeGreaterThan(0)
    expect(summary?.errors?.join(' ')).toContain('Effect Listener')
  })
})

class WatchedEffectLoader extends EffectLoader {
  /** Reports a file change the way the directory watcher does. */
  public reportChange(filePath: string): Promise<void> {
    return this.handleFileChange(filePath)
  }
}

describe('EffectLoader watcher reports', () => {
  let tmpDir: string
  let loader: WatchedEffectLoader

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-loader-watch-'))
    loader = new WatchedEffectLoader({ baseDir: tmpDir })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not load a file again when the watcher reports its own save', async () => {
    const changes = jest.fn()
    loader.on('changed', changes)

    const { path: saved } = await loader.saveFile('yarg', 'e.json', minimalYargEffectFixture('g'))
    await loader.reportChange(saved)

    expect(changes).toHaveBeenCalledTimes(1)
  })

  it('loads a saved file the watcher reports once it differs from the save', async () => {
    const changes = jest.fn()
    loader.on('changed', changes)

    const { path: saved } = await loader.saveFile('yarg', 'e.json', minimalYargEffectFixture('g'))
    const edited = { ...minimalYargEffectFixture('g'), group: { id: 'g', name: 'Edited' } }
    fs.writeFileSync(saved, JSON.stringify(edited), 'utf-8')
    await loader.reportChange(saved)

    expect(changes).toHaveBeenCalledTimes(2)
    expect(loader.getSummary().yarg[0].groupName).toBe('Edited')
  })
})
