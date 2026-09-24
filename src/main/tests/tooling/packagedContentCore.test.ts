import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  listFiles,
  unpackedInIndex,
  unpackedProblems,
  defaultsProblems,
} = require('../../../../tools/packagedContentCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Tree = Record<string, string>

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'packaged-content-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

let folders = 0

/** Writes each file of `tree` under a fresh folder in the scratch directory. */
function folder(name: string, tree: Tree): string {
  const root = join(scratch, `${name}-${++folders}`)
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(root, { recursive: true })
  return root
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

/** An asar index that marks every file of `tree` unpacked, as electron-builder writes one. */
function indexFor(tree: Tree): Record<string, unknown> {
  const index: { files: Record<string, unknown> } = { files: {} }
  for (const [path, text] of Object.entries(tree)) {
    let node = index
    const segments = path.split('/')
    for (const segment of segments.slice(0, -1)) {
      node.files[segment] ??= { unpacked: true, files: {} }
      node = node.files[segment] as { files: Record<string, unknown> }
    }
    node.files[segments[segments.length - 1]] = {
      size: Buffer.byteLength(text),
      unpacked: true,
      integrity: { algorithm: 'SHA256', hash: sha(text), blockSize: 4194304, blocks: [] },
    }
  }
  index.files['packed.js'] = { size: 4, offset: '0' }
  return index
}

const BINDINGS = 'node_modules/@serialport/bindings-cpp'
const NESTED = 'node_modules/enttec-open-dmx-usb/node_modules/@serialport/bindings-cpp'
const shipped: Tree = {
  [`${BINDINGS}/package.json`]: '{}',
  [`${BINDINGS}/build/Release/bindings.node`]: 'native',
  [`${NESTED}/package.json`]: '{}',
  [`${NESTED}/prebuilds/win32-x64/node.napi.node`]: 'native',
  'node_modules/fsevents/fsevents.node': 'mac',
}

/**
 * What the check says of an unpacked folder holding `onDisk` beside an index built from `indexed`.
 */
function checkUnpacked(indexed: Tree, onDisk: Tree): string[] {
  return unpackedProblems(unpackedInIndex(indexFor(indexed)), listFiles(folder('unpacked', onDisk)))
}

describe('unpackedProblems', () => {
  it('passes the serial bindings and fsevents as the index lists them', () => {
    expect(checkUnpacked(shipped, shipped)).toEqual([])
  })

  it('passes a build with no fsevents, which only macOS installs', () => {
    const others = { ...shipped }
    delete others['node_modules/fsevents/fsevents.node']

    expect(checkUnpacked(others, others)).toEqual([])
  })

  it('names a file the index lists that is missing or changed', () => {
    const onDisk: Tree = { ...shipped, [`${BINDINGS}/package.json`]: '{"x":1}' }
    delete onDisk[`${NESTED}/package.json`]

    expect(checkUnpacked(shipped, onDisk)).toEqual([
      `${BINDINGS}/package.json is 7 bytes, and the archive index says 2`,
      `missing from app.asar.unpacked: ${NESTED}/package.json`,
    ])
  })

  it('names a file of the same size whose hash differs', () => {
    const onDisk = { ...shipped, [`${BINDINGS}/package.json`]: '[]' }

    expect(checkUnpacked(shipped, onDisk)).toEqual([
      `${BINDINGS}/package.json does not match the hash the archive index records`,
    ])
  })

  it('names a file the index does not list, and one outside the unpacked packages', () => {
    const extra = { ...shipped, 'node_modules/left-pad/index.js': 'x' }

    expect(checkUnpacked(shipped, extra)).toEqual([
      'not in the archive index: node_modules/left-pad/index.js',
      'unexpected in app.asar.unpacked: node_modules/left-pad/index.js',
    ])
    expect(checkUnpacked(extra, extra)).toEqual([
      'unexpected in app.asar.unpacked: node_modules/left-pad/index.js',
    ])
  })

  it('names a copy of the serial bindings with no native module, and a build with none', () => {
    const noNested = { ...shipped }
    delete noNested[`${NESTED}/prebuilds/win32-x64/node.napi.node`]

    expect(checkUnpacked(noNested, noNested)).toEqual([`no native module under ${NESTED}`])
    expect(checkUnpacked({}, {})).toEqual(['no @serialport/bindings-cpp in app.asar.unpacked'])
  })
})

describe('defaultsProblems', () => {
  const source: Tree = {
    'node-data/cues/yarg/stagekit.json': '{"cueVersion":12}',
    'node-data/effects/audio/.gitkeep': '',
    'lights.json': '[]',
  }

  it('passes a copy that matches resources/defaults, dotfiles left out', () => {
    const copied = { ...source }
    delete copied['node-data/effects/audio/.gitkeep']

    expect(
      defaultsProblems(
        listFiles(folder('source', source), { skipDotFiles: true }),
        listFiles(folder('packaged', copied)),
      ),
    ).toEqual([])
  })

  it('names a missing folder, and each file missing, changed or extra', () => {
    const sourceFiles = listFiles(folder('source', source), { skipDotFiles: true })
    const packaged = listFiles(folder('packaged', { 'lights.json': '[1]', 'stray.json': '{}' }))

    expect(defaultsProblems(sourceFiles, null)).toEqual([
      'no defaults folder in the packaged resources',
    ])
    expect(defaultsProblems(sourceFiles, packaged)).toEqual([
      'defaults/lights.json differs from resources/',
      'defaults/node-data/cues/yarg/stagekit.json is missing',
      'defaults/stray.json is not in resources/defaults',
    ])
  })
})
