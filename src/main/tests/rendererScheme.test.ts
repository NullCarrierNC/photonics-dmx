import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('electron', () => ({ app: { once: jest.fn() }, protocol: {} }))

import { rendererFileFor, rendererPageUrl, rendererResponse } from '../rendererScheme'

let scratch: string
let rendererDir: string

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'renderer-scheme-'))
  rendererDir = join(scratch, 'out', 'renderer')
  mkdirSync(join(rendererDir, 'assets'), { recursive: true })
  writeFileSync(join(rendererDir, 'index.html'), '<!doctype html>')
  writeFileSync(join(rendererDir, 'assets', 'index-abc.js'), 'export {}')
  writeFileSync(join(rendererDir, 'assets', 'index-abc.css'), 'body{}')
  writeFileSync(join(rendererDir, 'assets', 'font.typeface-abc.json'), '{"glyphs":{}}')
  writeFileSync(join(rendererDir, 'assets', 'icon.png'), 'png')
  writeFileSync(join(rendererDir, 'assets', 'data.bin'), 'bin')
  writeFileSync(join(scratch, 'out', 'secret.txt'), 'secret')
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

async function get(url: string): Promise<{ status: number; type: string | null; body: string }> {
  const response = await rendererResponse(url, rendererDir)
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    body: await response.text(),
  }
}

describe('renderer scheme', () => {
  it('builds the entry URL with the page a window shows', () => {
    expect(rendererPageUrl()).toBe('photonics://renderer/index.html')
    expect(rendererPageUrl('dmx console')).toBe(
      'photonics://renderer/index.html?window=dmx%20console',
    )
  })

  it('serves the entry page and the built assets with their content types', async () => {
    expect(await get('photonics://renderer/index.html?window=console')).toEqual({
      status: 200,
      type: 'text/html; charset=utf-8',
      body: '<!doctype html>',
    })
    expect((await get('photonics://renderer/')).status).toBe(200)
    expect((await get('photonics://renderer/assets/index-abc.js')).type).toBe(
      'text/javascript; charset=utf-8',
    )
    expect((await get('photonics://renderer/assets/index-abc.css')).type).toBe(
      'text/css; charset=utf-8',
    )
    expect((await get('photonics://renderer/assets/font.typeface-abc.json')).type).toBe(
      'application/json; charset=utf-8',
    )
    expect((await get('photonics://renderer/assets/icon.png')).type).toBe('image/png')
    expect((await get('photonics://renderer/assets/data.bin')).type).toBe(
      'application/octet-stream',
    )
  })

  it('answers 404 for a missing file and a folder', async () => {
    expect((await get('photonics://renderer/assets/missing.js')).status).toBe(404)
    expect((await get('photonics://renderer/assets')).status).toBe(404)
  })

  it.each([
    'photonics://renderer/../secret.txt',
    'photonics://renderer/%2e%2e/secret.txt',
    'photonics://renderer/assets/..%2f..%2fsecret.txt',
    'photonics://renderer/assets/..%5c..%5csecret.txt',
    'photonics://renderer/..\\secret.txt',
    'photonics://other/index.html',
    'file:///etc/hosts',
  ])('keeps %s from reaching anything outside the renderer folder', async (url) => {
    const answer = await get(url)

    expect(answer.status).toBe(404)
    expect(answer.body).not.toContain('secret')
  })

  it('answers 404 for a link inside the folder that points out of it', async () => {
    try {
      symlinkSync(join(scratch, 'out', 'secret.txt'), join(rendererDir, 'assets', 'link.txt'))
    } catch {
      // Windows refuses a symbolic link to an account without the right to make one.
      return
    }

    expect((await get('photonics://renderer/assets/link.txt')).status).toBe(404)
  })

  it('maps no URL to a path outside the folder', () => {
    for (const url of [
      'photonics://renderer/../../../../etc/hosts',
      'photonics://renderer/%2e%2e/%2e%2e/%2e%2e/etc/hosts',
      'photonics://renderer/%00.html',
    ]) {
      const file = rendererFileFor(url, rendererDir)
      expect(file === null || file.startsWith(rendererDir)).toBe(true)
    }
  })
})
