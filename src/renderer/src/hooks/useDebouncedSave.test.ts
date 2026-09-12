/** @jest-environment jsdom */
/**
 * One write for a burst of changes, and nothing lost by leaving the page mid-burst.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedSave } from './useDebouncedSave'

describe('useDebouncedSave', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('writes once for a burst, with the last value', () => {
    const write = jest.fn<(value: number) => Promise<undefined>>(async () => undefined)
    const { result } = renderHook(() => useDebouncedSave(write, { quietMs: 100 }))

    act(() => {
      result.current.saveSoon(1)
      result.current.saveSoon(2)
      result.current.saveSoon(3)
    })
    expect(write).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(100)
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(3)
  })

  it('writes what it is holding when the page goes away', () => {
    const write = jest.fn<(value: string) => Promise<undefined>>(async () => undefined)
    const { result, unmount } = renderHook(() => useDebouncedSave(write, { quietMs: 100 }))

    act(() => {
      result.current.saveSoon('late change')
    })
    unmount()

    expect(write).toHaveBeenCalledWith('late change')
  })

  it('writes nothing when a burst was cancelled', () => {
    const write = jest.fn<(value: number) => Promise<undefined>>(async () => undefined)
    const { result } = renderHook(() => useDebouncedSave(write, { quietMs: 100 }))

    act(() => {
      result.current.saveSoon(1)
      result.current.cancel()
      jest.advanceTimersByTime(100)
    })

    expect(write).not.toHaveBeenCalled()
  })

  it('writes on request without waiting for the window', () => {
    const write = jest.fn<(value: number) => Promise<undefined>>(async () => undefined)
    const { result } = renderHook(() => useDebouncedSave(write, { quietMs: 1000 }))

    act(() => {
      result.current.saveSoon(7)
      result.current.flush()
    })

    expect(write).toHaveBeenCalledWith(7)
  })

  it('drops a value that matches what was already stored', () => {
    const write = jest.fn<(value: number) => Promise<undefined>>(async () => undefined)
    const { result } = renderHook(() =>
      useDebouncedSave(write, { quietMs: 100, isEqual: (a: number, b: number) => a === b }),
    )

    act(() => {
      result.current.seed(5)
      result.current.saveSoon(5)
      jest.advanceTimersByTime(100)
    })

    expect(write).not.toHaveBeenCalled()
  })

  it('takes a per-burst quiet window', () => {
    const write = jest.fn<(value: number) => Promise<undefined>>(async () => undefined)
    const { result } = renderHook(() => useDebouncedSave(write, { quietMs: 1000 }))

    act(() => {
      result.current.saveSoon(1, 50)
      jest.advanceTimersByTime(50)
    })

    expect(write).toHaveBeenCalledWith(1)
  })
})
