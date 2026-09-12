import { describe, expect, it } from '@jest/globals'
import { isValidEditorEdge } from './edgeValidation'

describe('isValidEditorEdge', () => {
  it.each([
    ['event', 'action', 'cue', true],
    ['action', 'logic', 'cue', true],
    ['logic', 'event-raiser', 'cue', true],
    ['action', 'effect-raiser', 'cue', true],
    ['effect-raiser', 'action', 'cue', true],
    ['event-listener', 'action', 'cue', true],
    ['action', 'event', 'cue', false],
    ['action', 'event-listener', 'cue', false],
    ['notes', 'action', 'cue', false],
    ['action', 'notes', 'cue', false],
    ['event', 'action', 'effect', true],
    ['effect-listener', 'logic', 'effect', true],
    ['event-listener', 'event-raiser', 'effect', true],
    ['action', 'effect-raiser', 'effect', false],
    ['effect-raiser', 'action', 'effect', false],
    ['action', 'event', 'effect', false],
  ] as const)('%s to %s in %s mode is %s', (source, target, mode, expected) => {
    expect(isValidEditorEdge(source, target, mode)).toBe(expected)
  })
})
