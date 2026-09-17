import {
  normalizeBlackoutShortcutKey,
  normalizeBlackoutShortcutScope,
} from '../configurationDefaults'

const GARBAGE = [undefined, null, '', 'nonsense', 0, {}, []]

describe('normalizeBlackoutShortcutKey', () => {
  it('passes the two valid keys through', () => {
    expect(normalizeBlackoutShortcutKey('escape')).toBe('escape')
    expect(normalizeBlackoutShortcutKey('backquote')).toBe('backquote')
  })

  it('normalizes anything else to escape', () => {
    // An absent key is the common case, since a stored prefs file need not carry this one.
    expect(normalizeBlackoutShortcutKey(undefined)).toBe('escape')
    expect(normalizeBlackoutShortcutKey('Backquote')).toBe('escape')
    expect(normalizeBlackoutShortcutKey('`')).toBe('escape')
    expect(normalizeBlackoutShortcutKey(null)).toBe('escape')
    expect(normalizeBlackoutShortcutKey(42)).toBe('escape')
  })

  it('never falls back to a key people type', () => {
    // Garbage on disk must not land on the backquote, which would silently swallow a character
    // somewhere without the user having chosen it.
    for (const value of GARBAGE) {
      expect(normalizeBlackoutShortcutKey(value)).not.toBe('backquote')
    }
  })
})

describe('normalizeBlackoutShortcutScope', () => {
  it('passes the three valid scopes through', () => {
    expect(normalizeBlackoutShortcutScope('disabled')).toBe('disabled')
    expect(normalizeBlackoutShortcutScope('focused')).toBe('focused')
    expect(normalizeBlackoutShortcutScope('system-wide')).toBe('system-wide')
  })

  it('normalizes anything else to focused', () => {
    expect(normalizeBlackoutShortcutScope(undefined)).toBe('focused')
    expect(normalizeBlackoutShortcutScope('System-Wide')).toBe('focused')
    expect(normalizeBlackoutShortcutScope('')).toBe('focused')
    expect(normalizeBlackoutShortcutScope(null)).toBe('focused')
    expect(normalizeBlackoutShortcutScope(42)).toBe('focused')
  })

  it('never falls back to the system-wide binding', () => {
    // Claiming the key from every other application is a choice the user has to make deliberately,
    // so no amount of garbage on disk can arrive at it.
    for (const value of GARBAGE) {
      expect(normalizeBlackoutShortcutScope(value)).not.toBe('system-wide')
    }
  })
})
