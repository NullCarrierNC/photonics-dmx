/**
 * ActionEffectFactory tests: buildEffect (set-color, blackout, invalid), resolveLights.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  ActionEffectFactory,
  resolvePositionToAbsolutePercent,
} from '../../../../cues/node/compiler/ActionEffectFactory'
import { DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } from '../../../../types'
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

  it('coerces delay + waitUntilTime 0 to none + 0 in built transition', () => {
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
    const effect = ActionEffectFactory.buildEffect({
      action,
      lights,
      resolvedTiming: {
        waitForCondition: 'none',
        waitForTime: 0,
        duration: 200,
        waitUntilCondition: 'delay',
        waitUntilTime: 0,
      },
      resolvedLayer: 0,
    })
    expect(effect).not.toBeNull()
    expect(effect!.transitions.length).toBe(1)
    expect(effect!.transitions[0].waitUntilCondition).toBe('none')
    expect(effect!.transitions[0].waitUntilTime).toBe(0)
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

describe('resolvePositionToAbsolutePercent', () => {
  const base = { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, panHome: 50 }

  it('direction mode: panDirectionCW false negates bearing offset relative to CW', () => {
    const cw = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: true },
    )
    const ccw = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: false },
    )
    const offset = (90 / base.panRangeDeg) * 100
    expect(cw.pan).toBeCloseTo(50 + offset, 5)
    expect(ccw.pan).toBeCloseTo(50 - offset, 5)
  })

  it('offset mode: panDirectionCW false negates pan offset degrees', () => {
    const cw = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 45, tiltOffsetDeg: 0 },
      { ...base, panDirectionCW: true },
    )
    const ccw = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 45, tiltOffsetDeg: 0 },
      { ...base, panDirectionCW: false },
    )
    const d = (45 / base.panRangeDeg) * 100
    expect(cw.pan).toBeCloseTo(50 + d, 5)
    expect(ccw.pan).toBeCloseTo(50 - d, 5)
  })

  it('direction mode anchors to panStageDeg, not panHome', () => {
    const cfg = { ...base, panHome: 30, panStageDeg: 360, panRangeDeg: 540 }
    const stageZeroPct = (360 / 540) * 100
    const result = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 0, angleFromVerticalDeg: 0 },
      cfg,
    )
    expect(result.pan).toBeCloseTo(stageZeroPct, 5)
  })

  it('direction mode anchors tilt to tiltStageDeg, not tiltHome', () => {
    const cfg = { ...base, tiltHome: 30, tiltStageDeg: 120, tiltRangeDeg: 180 }
    const tiltStageZeroPct = (120 / 180) * 100
    const result = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 0, angleFromVerticalDeg: 0 },
      cfg,
    )
    expect(result.tilt).toBeCloseTo(tiltStageZeroPct, 5)
  })

  it('offset mode still anchors to panHome (not panStageDeg)', () => {
    const cfg = { ...base, panHome: 30, panStageDeg: 360, panRangeDeg: 540 }
    const result = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 0, tiltOffsetDeg: 0 },
      cfg,
    )
    expect(result.pan).toBeCloseTo(30, 5)
  })

  it('offset mode: panHome 0 uses 360° alias instead of negative percent when offset goes negative', () => {
    const cfg = {
      ...base,
      panHome: 0,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
    }
    const result = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 60, tiltOffsetDeg: 0 },
      cfg,
    )
    expect(result.pan).toBeCloseTo((300 / 540) * 100, 4)
  })

  it('direction mode: panStage 360 keeps 360 alias over 0 when both are valid', () => {
    const cfg = { ...base, panHome: 30, panStageDeg: 360, panRangeDeg: 540, panDirectionCW: true }
    const result = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 0, angleFromVerticalDeg: 0 },
      cfg,
    )
    expect(result.pan).toBeCloseTo((360 / 540) * 100, 5)
  })

  it('direction mode: invertPan=true with panDirectionCW=true behaves like panDirectionCW=false (logicalPanDir XOR)', () => {
    // logicalPanDir XOR: CW=true + invert=true → -1, same as CW=false + invert=false → -1
    const withInvert = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: true, invertPan: true },
    )
    const withCCW = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: false, invertPan: false },
    )
    expect(withInvert.pan).toBeCloseTo(withCCW.pan!, 5)
  })

  it('offset mode: invertPan=true flips effective pan direction', () => {
    const withInvert = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 45, tiltOffsetDeg: 0 },
      { ...base, panDirectionCW: true, invertPan: true },
    )
    const withoutInvert = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 45, tiltOffsetDeg: 0 },
      { ...base, panDirectionCW: true, invertPan: false },
    )
    // Inverted pan should move in the opposite direction
    const center = base.panHome
    expect(withInvert.pan! - center).toBeCloseTo(-(withoutInvert.pan! - center), 5)
  })

  it('direction mode: invertPan=true + panDirectionCW=false behaves like panDirectionCW=true (double negation)', () => {
    // logicalPanDir XOR: CW=false + invert=true → 1, same as CW=true + invert=false → 1
    const doubleNeg = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: false, invertPan: true },
    )
    const cwNormal = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      { ...base, panDirectionCW: true, invertPan: false },
    )
    expect(doubleNeg.pan).toBeCloseTo(cwNormal.pan!, 5)
  })

  it('offset mode: invertTilt with mid-stage reference keeps zero offset anchored at tiltHome', () => {
    const cfg = { ...base, invertTilt: true, tiltHome: 25, tiltStageDeg: 90, tiltRangeDeg: 180 }
    const result = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 0, tiltOffsetDeg: 0 },
      cfg,
    )
    expect(result.tilt).toBeCloseTo(25, 5)
  })

  it('direction mode: invertTilt keeps tilt anchored to calibrated stage vertical', () => {
    const cfg = { ...base, invertTilt: true, tiltHome: 25, tiltStageDeg: 90, tiltRangeDeg: 180 }
    const result = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 180, angleFromVerticalDeg: 20 },
      cfg,
    )
    expect(result.tilt).toBeCloseTo(50 + (20 / 180) * 100, 5)
  })

  it('direction mode: bearingIsFlipped maps DS to same pan as unflipped US (180° -> 0°)', () => {
    const down = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 180, angleFromVerticalDeg: 0 },
      base,
    )
    const flipped = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 180, angleFromVerticalDeg: 0 },
      base,
      true,
    )
    const up = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 0, angleFromVerticalDeg: 0 },
      base,
    )
    expect(flipped.pan).toBeCloseTo(up.pan!, 5)
    expect(flipped.tilt).toBeCloseTo(up.tilt!, 5)
    expect(flipped.pan).not.toBeCloseTo(down.pan!, 3)
  })

  it('direction mode: bearingIsFlipped leaves stage-right (90°) unchanged', () => {
    const sr = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      base,
    )
    const srFlipped = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 90, angleFromVerticalDeg: 0 },
      base,
      true,
    )
    expect(srFlipped.pan).toBeCloseTo(sr.pan!, 5)
    expect(srFlipped.tilt).toBeCloseTo(sr.tilt!, 5)
  })

  it('offset mode: bearingIsFlipped does not change pan/tilt', () => {
    const o = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 30, tiltOffsetDeg: 10 },
      base,
    )
    const of = resolvePositionToAbsolutePercent(
      { mode: 'offset', panOffsetDeg: 30, tiltOffsetDeg: 10 },
      base,
      true,
    )
    expect(of.pan).toBeCloseTo(o.pan!, 5)
    expect(of.tilt).toBeCloseTo(o.tilt!, 5)
  })
})
