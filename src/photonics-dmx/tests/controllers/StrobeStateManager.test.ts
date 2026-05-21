import { describe, expect, it, jest } from '@jest/globals'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'

describe('StrobeStateManager', () => {
  it('starts inactive', () => {
    const mgr = new StrobeStateManager()
    expect(mgr.getActive()).toBeNull()
  })

  it('setActive transitions and emits change exactly once per change', () => {
    const mgr = new StrobeStateManager()
    const listener = jest.fn()
    mgr.on('change', listener)

    mgr.setActive('slow')
    expect(mgr.getActive()).toBe('slow')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith('slow')

    // Repeating the same slot does not emit
    mgr.setActive('slow')
    expect(listener).toHaveBeenCalledTimes(1)

    mgr.setActive('fast')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith('fast')

    mgr.setActive(null)
    expect(mgr.getActive()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenLastCalledWith(null)
  })
})
