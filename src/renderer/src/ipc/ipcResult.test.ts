import { describe, expect, it } from '@jest/globals'
import { orThrow, wasRefused } from './ipcResult'

describe('wasRefused', () => {
  it('reads only an explicit failure as one', () => {
    expect(wasRefused({ success: false, error: 'nope' })).toBe(true)
    expect(wasRefused({ success: true })).toBe(false)
    expect(wasRefused({ yarg: [], audio: [] })).toBe(false)
    expect(wasRefused(undefined)).toBe(false)
    expect(wasRefused(null)).toBe(false)
  })
})

describe('orThrow', () => {
  it('hands back a payload that is not a refusal', () => {
    const summary = { yarg: ['a'], audio: [] }

    expect(orThrow(summary)).toBe(summary)
  })

  it('throws with the message the main process gave', () => {
    expect(() => orThrow({ success: false, error: 'Effect loader is not initialized.' })).toThrow(
      'Effect loader is not initialized.',
    )
  })

  it('still throws when the refusal carries no message', () => {
    expect(() => orThrow({ success: false } as { success: false; error: string })).toThrow(
      'refused without saying why',
    )
  })
})
