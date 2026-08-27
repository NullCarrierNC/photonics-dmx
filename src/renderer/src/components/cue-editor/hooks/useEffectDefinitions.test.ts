/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const readEffectFile = jest.fn()
jest.mock('../../../ipcApi', () => ({
  readEffectFile: (...args: unknown[]) => readEffectFile(...args),
}))

import { useEffectDefinitions } from './useEffectDefinitions'
import type { EditorDocument } from '../lib/types'

const cueDoc = (effects: Array<{ effectId: string; effectFileId: string }>): EditorDocument =>
  ({
    mode: 'cue',
    path: '/cues/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'g', name: 'Group' },
      cues: [{ id: 'cue-1', kind: 'lighting', effects }],
    },
  }) as unknown as EditorDocument

const groupedEffectFiles = {
  yarg: [{ groupId: 'effects-a', path: '/effects/a.json' }],
  audio: [],
} as unknown as Parameters<typeof useEffectDefinitions>[3]

describe('useEffectDefinitions', () => {
  beforeEach(() => {
    readEffectFile.mockReset()
  })

  it('starts empty and loads the definitions a cue references', async () => {
    readEffectFile.mockResolvedValue({
      effects: [{ id: 'fx-1', name: 'Pulse' }],
    } as never)

    const { result } = renderHook(() =>
      useEffectDefinitions(
        cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
        'cue-1',
        'yarg',
        groupedEffectFiles,
      ),
    )

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.get('fx-1')).toMatchObject({ id: 'fx-1', name: 'Pulse' })
  })

  it('drops a reference whose effect file is unknown without failing the batch', async () => {
    readEffectFile.mockResolvedValue({ effects: [{ id: 'fx-1', name: 'Pulse' }] } as never)

    const { result } = renderHook(() =>
      useEffectDefinitions(
        cueDoc([
          { effectId: 'fx-1', effectFileId: 'effects-a' },
          { effectId: 'fx-missing', effectFileId: 'effects-gone' },
        ]),
        'cue-1',
        'yarg',
        groupedEffectFiles,
      ),
    )

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.has('fx-missing')).toBe(false)
  })

  it('drops a reference whose id is missing from the loaded file', async () => {
    readEffectFile.mockResolvedValue({ effects: [{ id: 'other', name: 'Other' }] } as never)

    const { result } = renderHook(() =>
      useEffectDefinitions(
        cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
        'cue-1',
        'yarg',
        groupedEffectFiles,
      ),
    )

    await waitFor(() => expect(readEffectFile).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })

  it('survives a read failure and keeps the other definitions', async () => {
    readEffectFile.mockRejectedValue(new Error('read failed') as never)

    const { result } = renderHook(() =>
      useEffectDefinitions(
        cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
        'cue-1',
        'yarg',
        groupedEffectFiles,
      ),
    )

    await waitFor(() => expect(readEffectFile).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })

  it('does not read anything without a selected cue', () => {
    renderHook(() =>
      useEffectDefinitions(
        cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
        null,
        'yarg',
        groupedEffectFiles,
      ),
    )

    expect(readEffectFile).not.toHaveBeenCalled()
  })
})
