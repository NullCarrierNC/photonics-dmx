import { describe, expect, it, jest } from '@jest/globals'
import type { ActionNode, Connection } from '../../../../cues/types/nodeCueTypes'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { TrackedLight } from '../../../../types'
import type {
  ResolvedActionTiming,
  ResolvedColorSetting,
} from '../../../../cues/node/compiler/ActionEffectFactory'
import {
  buildActionChain,
  mapSetColorChainStepsForEffectFactory,
  markConsecutiveActionChainTailVisited,
  runContextBatch,
  tryBuildHomogeneousSetColorChainData,
  type ResolvedSetColorChainStep,
} from '../../../../cues/node/runtime/graphActionHelpers'

const makeAction = (overrides: Partial<ActionNode> & { id: string }): ActionNode =>
  ({
    nodeType: 'action',
    effectType: 'set-color',
    target: { groups: { source: 'static', value: [] }, filter: undefined },
    color: undefined,
    timing: undefined,
    layer: undefined,
    ...overrides,
  }) as unknown as ActionNode

const makeConn = (from: string, to: string): Connection =>
  ({ id: `${from}-${to}`, from, to }) as Connection

describe('graphActionHelpers', () => {
  describe('markConsecutiveActionChainTailVisited', () => {
    it('marks tail and emits activations', () => {
      const actions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as ActionNode[]
      const visited: string[] = []
      const activated: string[] = []
      const context = {
        markVisited: (id: string) => visited.push(id),
      } as unknown as ExecutionContext
      markConsecutiveActionChainTailVisited(context, actions, (id) => activated.push(id))
      expect(visited).toEqual(['b', 'c'])
      expect(activated).toEqual(['b', 'c'])
    })

    it('marks nothing for a length-1 chain', () => {
      const visited: string[] = []
      const context = {
        markVisited: (id: string) => visited.push(id),
      } as unknown as ExecutionContext
      markConsecutiveActionChainTailVisited(context, [makeAction({ id: 'only' })], () => undefined)
      expect(visited).toEqual([])
    })
  })

  describe('buildActionChain', () => {
    it('walks single-edge action chains', () => {
      const a = makeAction({ id: 'a' })
      const b = makeAction({ id: 'b' })
      const c = makeAction({ id: 'c' })
      const adjacency = new Map<string, Connection[]>([
        ['a', [makeConn('a', 'b')]],
        ['b', [makeConn('b', 'c')]],
      ])
      const actionMap = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ])
      const chain = buildActionChain(a, adjacency, actionMap)
      expect(chain.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    })

    it('stops at fan-out', () => {
      const a = makeAction({ id: 'a' })
      const b = makeAction({ id: 'b' })
      const c = makeAction({ id: 'c' })
      const adjacency = new Map<string, Connection[]>([
        ['a', [makeConn('a', 'b'), makeConn('a', 'c')]],
      ])
      const actionMap = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ])
      expect(buildActionChain(a, adjacency, actionMap).map((n) => n.id)).toEqual(['a'])
    })

    it('stops when next node is not in actionMap (e.g. logic node)', () => {
      const a = makeAction({ id: 'a' })
      const adjacency = new Map<string, Connection[]>([['a', [makeConn('a', 'logic1')]]])
      const actionMap = new Map([['a', a]])
      expect(buildActionChain(a, adjacency, actionMap).map((n) => n.id)).toEqual(['a'])
    })

    it('stops on a cycle without revisiting', () => {
      const a = makeAction({ id: 'a' })
      const b = makeAction({ id: 'b' })
      const adjacency = new Map<string, Connection[]>([
        ['a', [makeConn('a', 'b')]],
        ['b', [makeConn('b', 'a')]],
      ])
      const actionMap = new Map([
        ['a', a],
        ['b', b],
      ])
      expect(buildActionChain(a, adjacency, actionMap).map((n) => n.id)).toEqual(['a', 'b'])
    })
  })

  describe('tryBuildHomogeneousSetColorChainData', () => {
    it('returns null when a step fails', () => {
      const chain = [{ id: 'x' }, { id: 'y' }] as ActionNode[]
      const out = tryBuildHomogeneousSetColorChainData(chain, (a) =>
        a.id === 'x'
          ? {
              action: a,
              lights: [],
              lightIds: '1',
              resolvedLayer: 0,
              resolvedTiming: {} as never,
              resolvedColor: {} as never,
            }
          : null,
      )
      expect(out).toBeNull()
    })

    it('returns null when layer or lights diverge', () => {
      const chain = [{ id: 'x' }, { id: 'y' }] as ActionNode[]
      const mk = (a: ActionNode, layer: number, ids: string): ResolvedSetColorChainStep => ({
        action: a,
        lights: [],
        lightIds: ids,
        resolvedLayer: layer,
        resolvedTiming: {} as never,
        resolvedColor: {} as never,
      })
      expect(tryBuildHomogeneousSetColorChainData(chain, (a) => mk(a, 0, '1'))).not.toBeNull()
      expect(
        tryBuildHomogeneousSetColorChainData(chain, (a) =>
          a.id === 'x' ? mk(a, 0, '1') : mk(a, 1, '1'),
        ),
      ).toBeNull()
      expect(
        tryBuildHomogeneousSetColorChainData(chain, (a) =>
          a.id === 'x' ? mk(a, 0, '1') : mk(a, 0, '2'),
        ),
      ).toBeNull()
    })
  })

  describe('mapSetColorChainStepsForEffectFactory', () => {
    it('rebases each step onto baseLights/baseLayer with intensityScale=1', () => {
      const a = makeAction({ id: 'a' })
      const b = makeAction({ id: 'b' })
      const stepLights: TrackedLight[] = [{ id: 'L1' } as TrackedLight]
      const baseLights: TrackedLight[] = [{ id: 'BL1' } as TrackedLight]
      const resolvedColor = { r: 255 } as unknown as ResolvedColorSetting
      const resolvedTiming = { waitUntilCondition: 'none' } as unknown as ResolvedActionTiming
      const steps: ResolvedSetColorChainStep[] = [
        {
          action: a,
          lights: stepLights,
          lightIds: 'L1',
          resolvedLayer: 9,
          resolvedTiming,
          resolvedColor,
        },
        {
          action: b,
          lights: stepLights,
          lightIds: 'L1',
          resolvedLayer: 9,
          resolvedTiming,
          resolvedColor,
        },
      ]
      const out = mapSetColorChainStepsForEffectFactory(steps, baseLights, 3)
      expect(out).toHaveLength(2)
      expect(out[0].action).toBe(a)
      expect(out[1].action).toBe(b)
      out.forEach((entry) => {
        expect(entry.lights).toBe(baseLights)
        expect(entry.resolvedLayer).toBe(3)
        expect(entry.resolvedColor).toBe(resolvedColor)
        expect(entry.resolvedTiming).toBe(resolvedTiming)
        expect(entry.intensityScale).toBe(1)
      })
    })

    it('returns an empty array for empty steps', () => {
      expect(mapSetColorChainStepsForEffectFactory([], [], 0)).toEqual([])
    })
  })

  describe('runContextBatch', () => {
    const makeContextStub = (): {
      ctx: ExecutionContext
      calls: string[]
      setComplete: (b: boolean) => void
    } => {
      const calls: string[] = []
      let complete = true
      const ctx = {
        beginBatch: () => calls.push('beginBatch'),
        endBatch: () => calls.push('endBatch'),
        tryComplete: () => {
          calls.push('tryComplete')
          return complete
        },
        dispose: () => calls.push('dispose'),
      } as unknown as ExecutionContext
      return { ctx, calls, setComplete: (b) => (complete = b) }
    }

    it('wraps with begin/end and disposes when context completes', () => {
      const { ctx, calls } = makeContextStub()
      const exec = jest.fn()
      runContextBatch(ctx, ['a', 'b'], exec)
      expect(calls).toEqual(['beginBatch', 'endBatch', 'tryComplete', 'dispose'])
      expect(exec).toHaveBeenCalledWith('a')
      expect(exec).toHaveBeenCalledWith('b')
    })

    it('calls onBlocked when context did not complete and skips dispose', () => {
      const { ctx, calls, setComplete } = makeContextStub()
      setComplete(false)
      const onBlocked = jest.fn()
      runContextBatch(ctx, ['x'], () => undefined, { onBlocked })
      expect(calls).toEqual(['beginBatch', 'endBatch', 'tryComplete'])
      expect(onBlocked).toHaveBeenCalledTimes(1)
    })

    it('catches per-node errors via onNodeError without aborting the batch', () => {
      const { ctx, calls } = makeContextStub()
      const errors: Array<[string, unknown]> = []
      const exec = jest.fn((id: string) => {
        if (id === 'b') throw new Error('boom')
      })
      runContextBatch(ctx, ['a', 'b', 'c'], exec, {
        onNodeError: (id, err) => errors.push([id, err]),
      })
      expect(exec).toHaveBeenCalledTimes(3)
      expect(errors).toHaveLength(1)
      expect(errors[0][0]).toBe('b')
      expect((errors[0][1] as Error).message).toBe('boom')
      expect(calls).toContain('endBatch')
    })

    it('lets node errors propagate when onNodeError is not provided', () => {
      const { ctx } = makeContextStub()
      const exec = (id: string): void => {
        if (id === 'b') throw new Error('boom')
      }
      expect(() => runContextBatch(ctx, ['a', 'b'], exec)).toThrow('boom')
    })
  })
})
