/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import { useLatestGenerationGate } from './useLatestGenerationGate'

describe('useLatestGenerationGate', () => {
  it('drops stale async results when a newer generation started', async () => {
    const { result } = renderHook(() => useLatestGenerationGate())
    const applied: string[] = []
    const p1Token = result.current.nextGeneration()
    const p2Token = result.current.nextGeneration()

    await act(async () => {
      await Promise.resolve()
      if (result.current.isCurrentGeneration(p1Token)) {
        applied.push('first')
      }
    })
    await act(async () => {
      await Promise.resolve()
      if (result.current.isCurrentGeneration(p2Token)) {
        applied.push('second')
      }
    })

    expect(applied).toEqual(['second'])
  })
})
