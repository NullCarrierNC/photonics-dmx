import { describe, expect, it } from '@jest/globals'
import {
  buildSetPositionEffect,
  resolveSetPosition,
} from '../../../../cues/node/runtime/setPositionSubmission'
import { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import { UnknownValueWarnings } from '../../../../cues/node/runtime/valueResolver'
import type { ActionNode, NetEventNode } from '../../../../cues/types/nodeCueTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'

const lit = <T extends string | number>(value: T) => ({ source: 'literal' as const, value })

function moveFront(bearing: number, group = 'front'): ActionNode {
  return {
    id: 'move',
    type: 'action',
    effectType: 'set-position',
    target: { groups: lit(group), filter: lit('all') },
    position: { mode: 'direction', bearing: lit(bearing), angle: lit(0) },
    timing: {
      waitForCondition: lit('none'),
      waitForTime: lit(0),
      duration: lit(200),
      waitUntilCondition: lit('none'),
      waitUntilTime: lit(0),
      easing: lit('linear'),
    },
  }
}

function context(): ExecutionContext {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(
    ev,
    {} as CueData,
    new Map(),
    new Map(),
    new UnknownValueWarnings('t'),
  )
}

describe('resolveSetPosition', () => {
  const harness = () => createSequencerHarness({ frontCount: 2, backCount: 0, movingHead: true })

  it('resolves a move of the target lights, with the same fingerprint for the same move', () => {
    const h = harness()
    try {
      const first = resolveSetPosition(moveFront(90), context(), h.lightManager, () => undefined)
      const again = resolveSetPosition(moveFront(90), context(), h.lightManager, () => undefined)
      const other = resolveSetPosition(moveFront(180), context(), h.lightManager, () => undefined)
      if (typeof first === 'string' || typeof again === 'string' || typeof other === 'string') {
        throw new Error('the move resolved to nothing')
      }

      expect(first.lights.map((light) => light.id)).toEqual(h.frontLightIds)
      expect(again.fingerprint).toBe(first.fingerprint)
      expect(other.fingerprint).not.toBe(first.fingerprint)
      expect(buildSetPositionEffect(first)?.transitions.length).toBeGreaterThan(0)
    } finally {
      h.cleanup()
    }
  })

  it('says why there is nothing to move', () => {
    const h = harness()
    try {
      const noPosition = { ...moveFront(90), position: undefined }
      expect(resolveSetPosition(noPosition, context(), h.lightManager, () => undefined)).toBe(
        'no-position',
      )
      expect(
        resolveSetPosition(moveFront(90, 'back'), context(), h.lightManager, () => undefined),
      ).toBe('no-lights')
    } finally {
      h.cleanup()
    }
  })
})
