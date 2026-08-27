import { describe, expect, it, jest } from '@jest/globals'
import { EffectCallbackRegistry } from '../../controllers/sequencer/EffectCallbackRegistry'

describe('EffectCallbackRegistry', () => {
  it('fires and drops a registered callback', () => {
    const registry = new EffectCallbackRegistry()
    const onComplete = jest.fn()
    registry.set('pulse', onComplete)

    registry.fire('pulse')

    expect(onComplete).toHaveBeenCalledWith(false)
    expect(registry.get('pulse')).toBeUndefined()
    expect(registry.size).toBe(0)
  })

  it('firing an unregistered name is a no-op', () => {
    const registry = new EffectCallbackRegistry()
    expect(() => registry.fire('missing')).not.toThrow()
  })

  it('set replaces any callback already held for the name', () => {
    const registry = new EffectCallbackRegistry()
    const first = jest.fn()
    const second = jest.fn()
    registry.set('pulse', first)
    registry.set('pulse', second)

    registry.fire('pulse')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('remove drops a callback without firing it', () => {
    const registry = new EffectCallbackRegistry()
    const onComplete = jest.fn()
    registry.set('pulse', onComplete)

    registry.remove('pulse')
    registry.fire('pulse')

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('cancelAll fires every callback with cancelled=true and clears the registry', () => {
    const registry = new EffectCallbackRegistry()
    const a = jest.fn()
    const b = jest.fn()
    registry.set('a', a)
    registry.set('b', b)

    registry.cancelAll()

    expect(a).toHaveBeenCalledWith(true)
    expect(b).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('cancelAll survives a throwing callback and still fires the rest', () => {
    const registry = new EffectCallbackRegistry()
    const throwing = jest.fn((_cancelled: boolean) => {
      throw new Error('boom')
    })
    const after = jest.fn()
    registry.set('a', throwing)
    registry.set('b', after)

    expect(() => registry.cancelAll()).not.toThrow()

    expect(throwing).toHaveBeenCalledWith(true)
    expect(after).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('a callback that registers a new callback during cancelAll leaves the new one held', () => {
    const registry = new EffectCallbackRegistry()
    const late = jest.fn()
    registry.set('a', () => {
      registry.set('b', late)
    })

    registry.cancelAll()

    expect(registry.get('b')).toBeDefined()
    expect(late).not.toHaveBeenCalled()
  })
})
