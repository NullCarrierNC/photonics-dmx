import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  signingConfigProblems,
  packagingScriptProblems,
} = require('../../../../tools/codeSigningCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = join(__dirname, '..', '..', '..', '..')

describe('signingConfigProblems', () => {
  it('accepts a mac block that sets identity to null', () => {
    expect(signingConfigProblems('mac:\n  identity: null\n  notarize: false\n')).toEqual([])
  })

  it.each([
    ['no mac block', 'appId: com.example\n'],
    ['a mac block without identity', 'mac:\n  notarize: false\n'],
    ['a named identity', 'mac:\n  identity: "Someone (ABCDE12345)"\n'],
    ['ad-hoc signing through electron-builder', 'mac:\n  identity: "-"\n'],
  ])('refuses %s', (_label, yamlText) => {
    expect(signingConfigProblems(yamlText)).toHaveLength(1)
  })

  it('holds the repository electron-builder.yml to no identity', () => {
    expect(signingConfigProblems(readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8'))).toEqual(
      [],
    )
  })
})

describe('packagingScriptProblems', () => {
  it('accepts a packaging command that turns identity discovery off', () => {
    expect(
      packagingScriptProblems({
        'build:mac':
          'npm run build && electron-builder install-app-deps && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac',
      }),
    ).toEqual([])
  })

  it('leaves install-app-deps alone', () => {
    expect(packagingScriptProblems({ postinstall: 'electron-builder install-app-deps' })).toEqual(
      [],
    )
  })

  it('names a packaging command that leaves identity discovery on', () => {
    expect(
      packagingScriptProblems({ 'build:unpack': 'npm run build && electron-builder --dir' }),
    ).toEqual([
      'build:unpack runs "electron-builder --dir" without CSC_IDENTITY_AUTO_DISCOVERY=false',
    ])
  })

  it('holds every repository script that packages to identity discovery off', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(packagingScriptProblems(scripts)).toEqual([])
  })
})
