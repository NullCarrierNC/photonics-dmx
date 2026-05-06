/**
 * EffectLoader: path resolution for IPC consumers (EXPORT etc.).
 * Equivalent NodeCueLoader coverage lives in ../NodeCueLoader.test.ts.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
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
})
