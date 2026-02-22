/**
 * ActionEffectFactory tests: buildEffect (set-color, blackout, invalid), resolveLights.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ActionEffectFactory } from '../../../../cues/node/compiler/ActionEffectFactory'
import type { ActionNode } from '../../../../cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../cues/types/nodeCueTypes'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig, createMockTrackedLight } from '../../../helpers/testFixtures'

describe('ActionEffectFactory', () => {
  let lightManager: DmxLightManager
  const lights = [
    createMockTrackedLight({ id: 'l1', position: 0 }),
    createMockTrackedLight({ id: 'l2', position: 1 }),
  ]

  beforeEach(() => {
    lightManager = new DmxLightManager(createMockLightingConfig())
  })

  it('set-color action produces expected Effect with transitions', () => {
    const action: ActionNode = {
      id: 'a1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'medium' },
        blendMode: { source: 'literal', value: 'replace' },
      },
      timing: createDefaultActionTiming(),
    }
    const effect = ActionEffectFactory.buildEffect({
      action,
      lights,
      resolvedTiming: {
        waitForCondition: 'none',
        waitForTime: 0,
        duration: 200,
        waitUntilCondition: 'none',
        waitUntilTime: 0,
      },
      resolvedLayer: 0,
    })
    expect(effect).not.toBeNull()
    expect(effect!.transitions.length).toBeGreaterThan(0)
  })

  it('blackout action returns null', () => {
    const action: ActionNode = {
      id: 'a1',
      type: 'action',
      effectType: 'blackout',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      color: {
        name: { source: 'literal', value: 'black' },
        brightness: { source: 'literal', value: 'low' },
        blendMode: { source: 'literal', value: 'replace' },
      },
      timing: createDefaultActionTiming(),
    }
    const effect = ActionEffectFactory.buildEffect({ action, lights })
    expect(effect).toBeNull()
  })

  it('invalid action type returns null', () => {
    const action = {
      id: 'a1',
      type: 'action',
      effectType: 'invalid-type',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'medium' },
        blendMode: { source: 'literal', value: 'replace' },
      },
      timing: createDefaultActionTiming(),
    } as unknown as ActionNode
    const effect = ActionEffectFactory.buildEffect({ action, lights })
    expect(effect).toBeNull()
  })

  it('buildEffect returns null when lights array is empty', () => {
    const action: ActionNode = {
      id: 'a1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' },
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'medium' },
        blendMode: { source: 'literal', value: 'replace' },
      },
      timing: createDefaultActionTiming(),
    }
    const effect = ActionEffectFactory.buildEffect({ action, lights: [] })
    expect(effect).toBeNull()
  })

  it('resolveLights maps target groups to TrackedLight array', () => {
    const target = {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    }
    const result = ActionEffectFactory.resolveLights(lightManager, target)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('resolveLights uses light-array variable when variableResolver provides one', () => {
    const customLights = [createMockTrackedLight({ id: 'v1', position: 0 })]
    const target = {
      groups: { source: 'variable', name: 'myLights' },
      filter: { source: 'literal', value: 'all' },
    }
    const variableResolver = jest.fn((name: string) =>
      name === 'myLights' ? { type: 'light-array' as const, value: customLights } : undefined,
    )
    const result = ActionEffectFactory.resolveLights(lightManager, target, variableResolver)
    expect(result).toEqual(customLights)
    expect(variableResolver).toHaveBeenCalledWith('myLights')
  })
})
