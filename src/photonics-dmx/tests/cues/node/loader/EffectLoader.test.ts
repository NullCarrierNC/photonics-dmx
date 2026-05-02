/**
 * EffectLoader: path resolution for IPC consumers (EXPORT etc.).
 * Equivalent NodeCueLoader coverage lives in ../NodeCueLoader.test.ts.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { EffectLoader } from '../../../../cues/node/loader/EffectLoader'

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
