import * as path from 'path'
import { validateNodeScriptPath } from './inputValidation'

describe('validateNodeScriptPath', () => {
  const appPath = path.resolve('/app/bundle')
  const scripts = path.join(appPath, 'scripts', 'x.mjs')

  it('accepts a base filename and resolves under scripts/', () => {
    const r = validateNodeScriptPath(appPath, 'x.mjs')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe(path.resolve(scripts))
    }
  })

  it('rejects empty name', () => {
    const r = validateNodeScriptPath(appPath, '')
    expect(r.ok).toBe(false)
  })

  it('rejects path segments in scriptName', () => {
    for (const name of ['a/b', 'a\\b', 'nested/x.mjs']) {
      const r = validateNodeScriptPath(appPath, name)
      expect(r.ok).toBe(false)
    }
  })

  it('rejects . and .. as name', () => {
    for (const name of ['.', '..']) {
      const r = validateNodeScriptPath(appPath, name)
      expect(r.ok).toBe(false)
    }
  })

  it('rejects null bytes', () => {
    const r = validateNodeScriptPath(appPath, 'a\0b.mjs')
    expect(r.ok).toBe(false)
  })

  it('accepts a filename with consecutive dots in the name', () => {
    const r = validateNodeScriptPath(appPath, 'file..name.mjs')
    expect(r.ok).toBe(true)
  })
})
