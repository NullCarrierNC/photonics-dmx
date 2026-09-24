import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { readElectronFuses, fuseConfigProblems } = require('../../../../tools/fuseConfigCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const KNOWN = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
]

const HARDENED = `appId: com.example
# Fuses baked into the binary.
electronFuses:
  runAsNode: false
  enableNodeOptionsEnvironmentVariable: false
  # The inspector flags.
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  resetAdHocDarwinSignature: true
directories:
  buildResources: build
`

describe('readElectronFuses', () => {
  it('reads the fuses the electronFuses block sets, by their fuse-wire names', () => {
    expect(readElectronFuses(HARDENED, KNOWN)).toEqual({
      RunAsNode: false,
      EnableNodeOptionsEnvironmentVariable: false,
      EnableNodeCliInspectArguments: false,
      EnableEmbeddedAsarIntegrityValidation: true,
      OnlyLoadAppFromAsar: true,
    })
  })

  it('answers an empty set for a config with no electronFuses block', () => {
    expect(readElectronFuses('appId: com.example\n', KNOWN)).toEqual({})
  })

  it('reads every boolean spelling electron-builder reads', () => {
    const spelled = HARDENED.replace('runAsNode: false', 'runAsNode: False').replace(
      'onlyLoadAppFromAsar: true',
      'onlyLoadAppFromAsar: TRUE',
    )

    expect(readElectronFuses(spelled, KNOWN)).toMatchObject({
      RunAsNode: false,
      OnlyLoadAppFromAsar: true,
    })
  })

  it('reads a flow mapping', () => {
    const flow = `electronFuses: { runAsNode: false, onlyLoadAppFromAsar: true }\n`

    expect(readElectronFuses(flow, KNOWN)).toEqual({ RunAsNode: false, OnlyLoadAppFromAsar: true })
  })

  it('reads a fuse only under the camel-case key electron-builder reads', () => {
    const capitalised = HARDENED.replace('runAsNode: false', 'RunAsNode: false')

    expect(readElectronFuses(capitalised, KNOWN)).not.toHaveProperty('RunAsNode')
  })

  it('reads a key with no value as unset', () => {
    expect(
      readElectronFuses(HARDENED.replace('runAsNode: false', 'runAsNode:'), KNOWN),
    ).not.toHaveProperty('RunAsNode')
  })
})

describe('fuseConfigProblems', () => {
  it('passes the hardened five with the other two left unset', () => {
    expect(fuseConfigProblems(readElectronFuses(HARDENED, KNOWN))).toEqual([])
  })

  it('names a hardened fuse the config drops or turns the other way', () => {
    const loosened = HARDENED.replace('  runAsNode: false\n', '').replace(
      'onlyLoadAppFromAsar: true',
      'onlyLoadAppFromAsar: false',
    )

    expect(fuseConfigProblems(readElectronFuses(loosened, KNOWN))).toEqual([
      expect.stringContaining('RunAsNode'),
      expect.stringContaining('OnlyLoadAppFromAsar'),
    ])
  })

  it('holds the file-protocol and cookie fuses to their hardened setting once set', () => {
    const set = HARDENED.replace(
      '  resetAdHocDarwinSignature',
      '  grantFileProtocolExtraPrivileges: true\n  enableCookieEncryption: false\n  resetAdHocDarwinSignature',
    )

    expect(fuseConfigProblems(readElectronFuses(set, KNOWN))).toEqual([
      expect.stringContaining('GrantFileProtocolExtraPrivileges'),
      expect.stringContaining('EnableCookieEncryption'),
    ])
  })

  it('names a fuse set to a quoted value, which electron-builder reads as on', () => {
    const quoted = HARDENED.replace('runAsNode: false', "runAsNode: 'false'").replace(
      '  resetAdHocDarwinSignature',
      "  loadBrowserProcessSpecificV8Snapshot: 'false'\n  resetAdHocDarwinSignature",
    )

    expect(fuseConfigProblems(readElectronFuses(quoted, KNOWN))).toEqual([
      'RunAsNode must be set off in electronFuses',
      'RunAsNode must be true or false, and electron-builder reads "false" as on',
      'LoadBrowserProcessSpecificV8Snapshot must be true or false, and electron-builder reads "false" as on',
    ])
  })

  it('passes the file-protocol and cookie fuses set to their hardened setting', () => {
    const set = HARDENED.replace(
      '  resetAdHocDarwinSignature',
      '  grantFileProtocolExtraPrivileges: false\n  enableCookieEncryption: true\n  resetAdHocDarwinSignature',
    )

    expect(readElectronFuses(set, KNOWN)).toMatchObject({
      GrantFileProtocolExtraPrivileges: false,
      EnableCookieEncryption: true,
    })
    expect(fuseConfigProblems(readElectronFuses(set, KNOWN))).toEqual([])
  })
})
