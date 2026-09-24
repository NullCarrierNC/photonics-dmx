import { describe, expect, it } from '@jest/globals'
import { configRecoveryMessages } from './configRecoveryMessages'

describe('configRecoveryMessages', () => {
  it('says nothing when no file was recovered', () => {
    expect(configRecoveryMessages([])).toEqual([])
  })

  it('reports a file replaced by defaults as backed up', () => {
    const [message] = configRecoveryMessages([{ fileName: 'lights.json', reason: 'parse' }])
    expect(message).toContain('saved as a backup')
    expect(message).toContain('lights.json')
  })

  it('reports a file left in place with how to get it back', () => {
    const messages = configRecoveryMessages([
      { fileName: 'prefs.json', reason: 'parse', leftInPlace: true },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('prefs.json')
    expect(messages[0]).toMatch(/relaunch/i)
    expect(messages[0]).not.toContain('backup')
  })

  it('reports a repaired file as keeping everything but the reset values', () => {
    const messages = configRecoveryMessages([
      { fileName: 'prefs.json', reason: 'repaired', message: 'Reset to default: clockRate' },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Everything else was kept')
    expect(messages[0]).toContain('clockRate')
    expect(messages[0]).not.toContain('backup')
  })

  it('reports a file from a newer version as in use and not saved to', () => {
    const messages = configRecoveryMessages([{ fileName: 'prefs.json', reason: 'newerVersion' }])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('newer version')
    expect(messages[0]).toContain('prefs.json')
    expect(messages[0]).not.toContain('backup')
  })

  it('reports a newer version file this version cannot read as kept, with defaults in use', () => {
    const messages = configRecoveryMessages([
      { fileName: 'lightsLayout.json', reason: 'newerVersion', leftInPlace: true },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('cannot read')
    expect(messages[0]).toContain('defaults are in use')
    expect(messages[0]).toContain('lightsLayout.json')
    expect(messages[0]).not.toMatch(/relaunch/i)
  })

  it('gives each kind its own message when both happened', () => {
    expect(
      configRecoveryMessages([
        { fileName: 'lights.json', reason: 'schema' },
        { fileName: 'prefs.json', reason: 'repaired' },
      ]),
    ).toHaveLength(2)
  })
})
