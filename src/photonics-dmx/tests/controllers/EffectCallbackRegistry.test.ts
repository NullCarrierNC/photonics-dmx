import { describe, expect, it, jest } from '@jest/globals'
import { EffectCallbackRegistry } from '../../controllers/sequencer/EffectCallbackRegistry'

describe('EffectCallbackRegistry', () => {
  it('fires and drops a registered callback', () => {
    const registry = new EffectCallbackRegistry()
    const onComplete = jest.fn()
    registry.add('pulse', onComplete)

    registry.fire('pulse')

    expect(onComplete).toHaveBeenCalledWith(false)
    expect(registry.get('pulse')).toBeUndefined()
    expect(registry.size).toBe(0)
  })

  it('firing an unregistered name is a no-op', () => {
    const registry = new EffectCallbackRegistry()
    expect(() => registry.fire('missing')).not.toThrow()
  })

  it('holds every callback added for a name and fires them once each, in order', () => {
    const registry = new EffectCallbackRegistry()
    const order: string[] = []
    const first = jest.fn(() => order.push('first'))
    const second = jest.fn(() => order.push('second'))
    registry.add('pulse', first)
    registry.add('pulse', second)

    registry.fire('pulse')
    registry.fire('pulse')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['first', 'second'])
  })

  it('fires the rest of a name when one of its callbacks throws', () => {
    const registry = new EffectCallbackRegistry()
    const after = jest.fn()
    registry.add('pulse', () => {
      throw new Error('boom')
    })
    registry.add('pulse', after)

    expect(() => registry.fire('pulse')).not.toThrow()

    expect(after).toHaveBeenCalledWith(false)
  })

  it('holds a callback added for the name it is firing for the next completion', () => {
    const registry = new EffectCallbackRegistry()
    const next = jest.fn()
    registry.add('pulse', () => {
      registry.add('pulse', next)
    })

    registry.fire('pulse')

    expect(next).not.toHaveBeenCalled()
    expect(registry.get('pulse')).toEqual([next])
  })

  it('remove drops a callback without firing it', () => {
    const registry = new EffectCallbackRegistry()
    const onComplete = jest.fn()
    registry.add('pulse', onComplete)

    registry.remove('pulse')
    registry.fire('pulse')

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('cancelAll fires every callback with cancelled=true and clears the registry', () => {
    const registry = new EffectCallbackRegistry()
    const a = jest.fn()
    const b = jest.fn()
    const alsoA = jest.fn()
    registry.add('a', a)
    registry.add('b', b)
    registry.add('a', alsoA)

    registry.cancelAll()

    expect(a).toHaveBeenCalledWith(true)
    expect(b).toHaveBeenCalledWith(true)
    expect(alsoA).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('cancelAll survives a throwing callback and still fires the rest', () => {
    const registry = new EffectCallbackRegistry()
    const throwing = jest.fn((_cancelled: boolean) => {
      throw new Error('boom')
    })
    const after = jest.fn()
    registry.add('a', throwing)
    registry.add('b', after)

    expect(() => registry.cancelAll()).not.toThrow()

    expect(throwing).toHaveBeenCalledWith(true)
    expect(after).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('a callback that registers a new callback during cancelAll leaves the new one held', () => {
    const registry = new EffectCallbackRegistry()
    const late = jest.fn()
    registry.add('a', () => {
      registry.add('b', late)
    })

    registry.cancelAll()

    expect(registry.get('b')).toBeDefined()
    expect(late).not.toHaveBeenCalled()
  })
})
