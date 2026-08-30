import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Rb3MenuFramePump, RB3_MENU_ANIMATION_MS } from '../../processors/rb3MenuAnimation'
import type { Rb3MenuCueDispatch } from '../../cueHandlers/Rb3MenuCueHandler'

describe('Rb3MenuFramePump', () => {
  let playMenuFrame: jest.Mock
  let clear: jest.Mock
  let dispatch: Rb3MenuCueDispatch
  let active: boolean

  beforeEach(() => {
    jest.useFakeTimers()
    playMenuFrame = jest.fn()
    clear = jest.fn()
    dispatch = { playMenuFrame, clear } as unknown as Rb3MenuCueDispatch
    active = true
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const makePump = (immediateFirstFrame: boolean, restartOnStart: boolean): Rb3MenuFramePump =>
    new Rb3MenuFramePump({
      getDispatch: () => dispatch,
      isActive: () => active,
      immediateFirstFrame,
      restartOnStart,
    })

  it('paints an immediate frame and then one per interval when configured', () => {
    const pump = makePump(true, false)
    pump.start()
    expect(playMenuFrame).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(RB3_MENU_ANIMATION_MS * 2)
    expect(playMenuFrame).toHaveBeenCalledTimes(3)
    pump.stop()
  })

  it('waits one interval for the first frame when the immediate frame is off', () => {
    const pump = makePump(false, false)
    pump.start()
    expect(playMenuFrame).not.toHaveBeenCalled()
    jest.advanceTimersByTime(RB3_MENU_ANIMATION_MS)
    expect(playMenuFrame).toHaveBeenCalledTimes(1)
    pump.stop()
  })

  it('a repeated start is a no-op without restartOnStart', () => {
    const pump = makePump(true, false)
    pump.start()
    pump.start()
    expect(playMenuFrame).toHaveBeenCalledTimes(1)
    expect(clear).not.toHaveBeenCalled()
    pump.stop()
  })

  it('a repeated start restarts the interval (stopping first) with restartOnStart', () => {
    const pump = makePump(false, true)
    pump.start()
    pump.start()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(pump.isRunning()).toBe(true)
    pump.stop()
  })

  it('stop clears the menu look only when the pump was running', () => {
    const pump = makePump(false, false)
    pump.stop()
    expect(clear).not.toHaveBeenCalled()
    pump.start()
    pump.stop()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(pump.isRunning()).toBe(false)
  })

  it('an inactive gate skips the frame without stopping the pump', () => {
    const pump = makePump(false, false)
    pump.start()
    active = false
    jest.advanceTimersByTime(RB3_MENU_ANIMATION_MS * 2)
    expect(playMenuFrame).not.toHaveBeenCalled()
    active = true
    jest.advanceTimersByTime(RB3_MENU_ANIMATION_MS)
    expect(playMenuFrame).toHaveBeenCalledTimes(1)
    pump.stop()
  })

  it('a throwing menu handler is swallowed and the pump keeps running', () => {
    playMenuFrame.mockImplementation(() => {
      throw new Error('boom')
    })
    const pump = makePump(true, false)
    expect(() => pump.start()).not.toThrow()
    jest.advanceTimersByTime(RB3_MENU_ANIMATION_MS)
    expect(playMenuFrame).toHaveBeenCalledTimes(2)
    pump.stop()
  })

  it('does not start without a dispatch', () => {
    const pump = new Rb3MenuFramePump({
      getDispatch: () => null,
      isActive: () => true,
      immediateFirstFrame: true,
      restartOnStart: false,
    })
    pump.start()
    expect(pump.isRunning()).toBe(false)
  })
})
