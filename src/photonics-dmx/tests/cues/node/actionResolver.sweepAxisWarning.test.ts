/** The warning is reported once per process, so this must be the first linear sweep resolved. */
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

function makeContext(): ExecutionContext {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(ev, {} as CueData, new Map(), new Map())
}

const axislessSweep: NodeMotionPatternSetting = {
  pattern: { source: 'literal', value: 'linear-sweep' },
  speed: { source: 'literal', value: 0.5 },
  size: { source: 'literal', value: 40 },
}

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
  it('sweeps horizontally and warns once', () => {
    const ctx = makeContext()

    const first = resolveMotionPattern(axislessSweep, ctx)
    resolveMotionPattern(axislessSweep, ctx)

    expect(first.linearSweepAxis).toBe('horizontal')
    expect(first.panAmplitudeDeg).toBe(40)
    expect(first.tiltAmplitudeDeg).toBe(0)
    const warnings = entries.filter(
      (entry) => entry.level === 'warn' && entry.message.includes('linearSweepAxis'),
    )
    expect(warnings).toHaveLength(1)
  })
})
