import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { resolveMotionPattern } from '../../../cues/node/runtime/actionResolver'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import type { CueData } from '../../../cues/types/cueTypes'
import type { NodeMotionPatternSetting, NetEventNode } from '../../../cues/types/nodeCueTypes'
import {
  resetLogConfiguration,
  setLogSink,
  setMinLogLevel,
  type LogEntry,
} from '../../../../shared/logger'
import { UnknownValueWarnings } from '../../../cues/node/runtime/valueResolver'

function makeContext(): ExecutionContext {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(
    ev,
    {} as CueData,
    new Map(),
    new Map(),
    new UnknownValueWarnings('test'),
  )
}

/** A fresh setting per call, the way each compiled cue node holds its own. */
const axislessSweep = (): NodeMotionPatternSetting => ({
  pattern: { source: 'literal', value: 'linear-sweep' },
  speed: { source: 'literal', value: 0.5 },
  size: { source: 'literal', value: 40 },
})

const sweepWarnings = (): LogEntry[] =>
  entries.filter((entry) => entry.level === 'warn' && entry.message.includes('linearSweepAxis'))

let entries: LogEntry[] = []

beforeEach(() => {
  entries = []
  setMinLogLevel('debug')
  setLogSink((entry) => {
    entries.push(entry)
  })
})

afterEach(() => resetLogConfiguration())

describe('linear sweep without an axis', () => {
  it('sweeps horizontally and warns once for the node however often it runs', () => {
    const ctx = makeContext()
    const setting = axislessSweep()

    const first = resolveMotionPattern(setting, ctx)
    resolveMotionPattern(setting, ctx)

    expect(first.linearSweepAxis).toBe('horizontal')
    expect(first.panAmplitudeDeg).toBe(40)
    expect(first.tiltAmplitudeDeg).toBe(0)
    expect(sweepWarnings()).toHaveLength(1)
  })

  it('warns again for another node with the same fault', () => {
    const ctx = makeContext()

    resolveMotionPattern(axislessSweep(), ctx)
    resolveMotionPattern(axislessSweep(), ctx)

    expect(sweepWarnings()).toHaveLength(2)
  })
})
