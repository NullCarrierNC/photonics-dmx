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

    mgr.setActive('slow', 'net')
    expect(mgr.getActive()).toBe('slow')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith('slow')

    // Repeating the same slot does not emit
    mgr.setActive('slow', 'net')
    expect(listener).toHaveBeenCalledTimes(1)

    mgr.setActive('fast', 'net')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith('fast')

    mgr.setActive(null, 'net')
    expect(mgr.getActive()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenLastCalledWith(null)
  })

  it('leaves a strobe alone when the other domain ends its cue', () => {
    // Audio and the net domains run at once, and each ends its own cues without knowing about the
    // other, so an unqualified release let stopping audio drop a YARG strobe mid-cue.
    const mgr = new StrobeStateManager()
    mgr.setActive('fastest', 'net')

    mgr.setActive(null, 'audio')

    expect(mgr.getActive()).toBe('fastest')
  })

  it('gives up the slot for whoever took it', () => {
    const mgr = new StrobeStateManager()
    mgr.setActive('fastest', 'net')

    mgr.setActive(null, 'net')

    expect(mgr.getActive()).toBeNull()
  })

  it('lets the other domain take a slot that is already held', () => {
    // A starting strobe is a deliberate act, so the later one wins.
    const mgr = new StrobeStateManager()
    mgr.setActive('slow', 'net')

    mgr.setActive('medium', 'audio')

    expect(mgr.getActive()).toBe('medium')
  })

  it('hands the slot back to its new holder to release', () => {
    const mgr = new StrobeStateManager()
    mgr.setActive('slow', 'net')
    mgr.setActive('medium', 'audio')

    mgr.setActive(null, 'net')
    expect(mgr.getActive()).toBe('medium')

    mgr.setActive(null, 'audio')
    expect(mgr.getActive()).toBeNull()
  })

  it('reset gives up the slot whoever holds it', () => {
    const mgr = new StrobeStateManager()
    mgr.setActive('fast', 'audio')

    mgr.reset()

    expect(mgr.getActive()).toBeNull()
  })
})
