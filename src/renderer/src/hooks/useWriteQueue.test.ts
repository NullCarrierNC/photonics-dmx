/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useWriteQueue } from './useWriteQueue'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useWriteQueue', () => {
  it('starts each write once the one before it has settled', async () => {
    const { result } = renderHook(() => useWriteQueue())
    const first = deferred()
    const started: string[] = []

    let firstDone!: Promise<void>
    let secondDone!: Promise<void>
    act(() => {
      firstDone = result.current.enqueue(async () => {
        started.push('first')
        await first.promise
      })
      secondDone = result.current.enqueue(async () => {
        started.push('second')
      })
    })
    await act(async () => {})
    expect(started).toEqual(['first'])

    await act(async () => {
      first.resolve()
      await Promise.all([firstDone, secondDone])
    })
    expect(started).toEqual(['first', 'second'])
  })

  it('runs the next write after one that fails, and hands the failure to its caller', async () => {
    const { result } = renderHook(() => useWriteQueue())
    const outcomes: string[] = []

    await act(async () => {
      const failed = result.current.enqueue(async () => {
        throw new Error('refused')
      })
      const next = result.current.enqueue(async () => 'stored')
      outcomes.push(await failed.catch((e: Error) => e.message), await next)
    })

    expect(outcomes).toEqual(['refused', 'stored'])
  })

  it('counts the writes queued or running', async () => {
    const { result } = renderHook(() => useWriteQueue())
    const first = deferred()

    let done!: Promise<unknown>
    act(() => {
      const a = result.current.enqueue(() => first.promise)
      const b = result.current.enqueue(async () => undefined)
      done = Promise.all([a, b])
    })
    expect(result.current.pending).toBe(2)
    expect(result.current.isBusy()).toBe(true)

    await act(async () => {
      first.resolve()
      await done
    })
    expect(result.current.pending).toBe(0)
    expect(result.current.isBusy()).toBe(false)
  })
})
