import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  signingConfigProblems,
  packagingScriptProblems,
  signatureAuthorities,
  isMachO,
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

  it.each([
    [
      'a semicolon',
      'electron-builder install-app-deps; electron-builder --mac',
      'electron-builder --mac',
    ],
    [
      'an or',
      'electron-builder install-app-deps || electron-builder --dir',
      'electron-builder --dir',
    ],
    [
      'a pipe',
      'electron-builder install-app-deps | electron-builder --dir',
      'electron-builder --dir',
    ],
    [
      'an or after a guarded command',
      'cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --dir || electron-builder --mac',
      'electron-builder --mac',
    ],
  ])('names a packaging command after %s', (_label, script, command) => {
    expect(packagingScriptProblems({ pack: script })).toEqual([
      `pack runs "${command}" without CSC_IDENTITY_AUTO_DISCOVERY=false`,
    ])
  })

  it.each([
    ['names install-app-deps as an argument', 'electron-builder --mac install-app-deps'],
    ['runs a second electron-builder', 'electron-builder install-app-deps electron-builder --mac'],
  ])('names a command that %s', (_label, script) => {
    expect(packagingScriptProblems({ pack: script })).toEqual([
      `pack runs "${script}" without CSC_IDENTITY_AUTO_DISCOVERY=false`,
    ])
  })

  it('holds every repository script that packages to identity discovery off', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(packagingScriptProblems(scripts)).toEqual([])
  })
})

describe('signatureAuthorities', () => {
  it('lists the authorities a certificate signature names', () => {
    const output = [
      'Executable=/tmp/Example.app/Contents/MacOS/Example',
      'Identifier=com.example',
      'Authority=Apple Development: Example Person (ABCDE12345)',
      'Authority=Apple Worldwide Developer Relations Certification Authority',
      'Authority=Apple Root CA',
      'TeamIdentifier=ABCDE12345',
    ].join('\n')
    expect(signatureAuthorities(output)).toEqual([
      'Apple Development: Example Person (ABCDE12345)',
      'Apple Worldwide Developer Relations Certification Authority',
      'Apple Root CA',
    ])
  })

  it('finds none in an ad-hoc signature', () => {
    const output = 'Identifier=com.example\nSignature=adhoc\nTeamIdentifier=not set\n'
    expect(signatureAuthorities(output)).toEqual([])
  })
})

describe('isMachO', () => {
  it.each(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe'])(
    'recognises the %s magic number',
    (magic) => {
      expect(isMachO(Buffer.from(`${magic}00000000`, 'hex'))).toBe(true)
    },
  )

  it('rejects other files and anything shorter than a magic number', () => {
    expect(isMachO(Buffer.from('{"name":"x"}'))).toBe(false)
    expect(isMachO(Buffer.from('cffa', 'hex'))).toBe(false)
  })
})
