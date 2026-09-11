/** @jest-environment jsdom */
import { afterEach, describe, expect, it } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { confirmRequestAtom } from '../atoms'
import { useConfirm } from './useConfirm'

afterEach(() => getDefaultStore().set(confirmRequestAtom, null))

describe('useConfirm', () => {
  it('opens the shared dialog and resolves with the answer given', async () => {
    const { result } = renderHook(() => useConfirm())
    const answer = result.current({ title: 'Delete?', message: 'Gone for good', danger: true })

    const request = getDefaultStore().get(confirmRequestAtom)
    expect(request).toMatchObject({ title: 'Delete?', message: 'Gone for good', danger: true })
    request!.resolve(true)

    await expect(answer).resolves.toBe(true)
  })

  it('answers no at once while another confirm is open', async () => {
    const { result } = renderHook(() => useConfirm())
    const first = result.current({ title: 'First', message: '' })

    await expect(result.current({ title: 'Second', message: '' })).resolves.toBe(false)
    expect(getDefaultStore().get(confirmRequestAtom)?.title).toBe('First')

    getDefaultStore().get(confirmRequestAtom)!.resolve(false)
    await expect(first).resolves.toBe(false)
  })

  it('returns the same function on every render', () => {
    const { result, rerender } = renderHook(() => useConfirm())
    const confirm = result.current
    rerender()
    expect(result.current).toBe(confirm)
  })
})
