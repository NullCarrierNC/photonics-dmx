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

  it('drops a value that matches the last write that landed', async () => {
    const write = jest.fn<(value: number) => Promise<boolean>>(async () => true)
    const { result } = renderHook(() =>
      useDebouncedSave(write, { quietMs: 100, isEqual: (a: number, b: number) => a === b }),
    )

    act(() => {
      result.current.saveSoon(3)
      result.current.flush()
    })
    await act(async () => {})
    act(() => {
      result.current.saveSoon(3)
      result.current.flush()
    })

    expect(write).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['answered false', () => Promise.resolve(false)],
    ['rejected', () => Promise.reject(new Error('channel gone'))],
  ])('writes the same value again after a write that %s', async (_answer, fail) => {
    const write = jest.fn<(value: number) => Promise<boolean>>(async () => true)
    write.mockImplementationOnce(fail)
    const { result } = renderHook(() =>
      useDebouncedSave(write, { quietMs: 100, isEqual: (a: number, b: number) => a === b }),
    )

    act(() => {
      result.current.saveSoon(3)
      jest.advanceTimersByTime(100)
    })
    await act(async () => {})
    act(() => {
      result.current.saveSoon(3)
      jest.advanceTimersByTime(100)
    })

    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(3)
  })

  it('keeps a value seeded while a write was in flight', async () => {
    let answer!: (landed: boolean) => void
    const write = jest.fn<(value: number) => Promise<boolean>>(
      () => new Promise((resolve) => (answer = resolve)),
    )
    const { result } = renderHook(() =>
      useDebouncedSave(write, { quietMs: 100, isEqual: (a: number, b: number) => a === b }),
    )

    act(() => {
      result.current.saveSoon(50)
      result.current.flush()
      result.current.seed(40)
    })
    await act(async () => answer(true))
    act(() => {
      result.current.saveSoon(40)
      result.current.flush()
    })
    expect(write).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.saveSoon(50)
      result.current.flush()
    })
    expect(write).toHaveBeenCalledTimes(2)
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
