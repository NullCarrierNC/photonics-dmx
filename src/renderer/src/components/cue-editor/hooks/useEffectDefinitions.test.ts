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

  it('does not re-read when the document changes identity but the request key does not', async () => {
    readEffectFile.mockResolvedValue({
      effects: [{ id: 'fx-1', name: 'Pulse' }],
    } as never)

    const refs = [{ effectId: 'fx-1', effectFileId: 'effects-a' }]
    const { result, rerender } = renderHook(
      ({ doc }: { doc: EditorDocument }) =>
        useEffectDefinitions(doc, 'cue-1', 'yarg', groupedEffectFiles),
      { initialProps: { doc: cueDoc(refs) } },
    )

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(readEffectFile).toHaveBeenCalledTimes(1)

    // A fresh document object with the same path, cue and effect references: metadata edits
    // churn the document identity constantly and must not restart the read.
    rerender({ doc: cueDoc(refs) })

    expect(readEffectFile).toHaveBeenCalledTimes(1)
    expect(result.current.get('fx-1')).toMatchObject({ name: 'Pulse' })
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
    const { result } = renderHook(() =>
      useEffectDefinitions(
        cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
        null,
        'yarg',
        groupedEffectFiles,
      ),
    )

    expect(readEffectFile).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)
  })

  it('clears loaded definitions when leaving cue mode', async () => {
    readEffectFile.mockResolvedValue({
      effects: [{ id: 'fx-1', name: 'Pulse' }],
    } as never)

    const { result, rerender } = renderHook(
      ({ doc, selectedId }: { doc: EditorDocument | null; selectedId: string | null }) =>
        useEffectDefinitions(doc, selectedId, 'yarg', groupedEffectFiles),
      {
        initialProps: {
          doc: cueDoc([{ effectId: 'fx-1', effectFileId: 'effects-a' }]),
          selectedId: 'cue-1' as string | null,
        },
      },
    )

    await waitFor(() => expect(result.current.size).toBe(1))

    rerender({
      doc: {
        mode: 'effect',
        path: '/effects/file.json',
        file: { mode: 'yarg', effects: [{ id: 'fx-1' }] },
      } as unknown as EditorDocument,
      selectedId: 'fx-1',
    })

    expect(result.current.size).toBe(0)
  })

  it('clears stale definitions immediately when switching cues', async () => {
    const docWithTwoCues = (): EditorDocument =>
      ({
        mode: 'cue',
        path: '/cues/file.json',
        file: {
          mode: 'yarg',
          group: { id: 'g', name: 'Group' },
          cues: [
            {
              id: 'cue-1',
              kind: 'lighting',
              effects: [{ effectId: 'fx-1', effectFileId: 'effects-a' }],
            },
            {
              id: 'cue-2',
              kind: 'lighting',
              effects: [{ effectId: 'fx-2', effectFileId: 'effects-a' }],
            },
          ],
        },
      }) as unknown as EditorDocument

    readEffectFile.mockResolvedValueOnce({
      effects: [{ id: 'fx-1', name: 'Pulse' }],
    } as never)

    const stableDoc = docWithTwoCues()
    const { result, rerender } = renderHook(
      ({ selectedId }: { selectedId: string }) =>
        useEffectDefinitions(stableDoc, selectedId, 'yarg', groupedEffectFiles),
      { initialProps: { selectedId: 'cue-1' } },
    )

    await waitFor(() => expect(result.current.size).toBe(1))

    readEffectFile.mockResolvedValueOnce({
      effects: [{ id: 'fx-2', name: 'Sweep' }],
    } as never)

    rerender({ selectedId: 'cue-2' })
    expect(result.current.size).toBe(0)

    await waitFor(() => expect(result.current.get('fx-2')).toMatchObject({ id: 'fx-2' }))
    expect(result.current.has('fx-1')).toBe(false)
  })

  it('ignores out-of-order completions from a superseded request', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    let firstSettled = false
    readEffectFile
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = (value) => {
              firstSettled = true
              resolve(value)
            }
          }),
      )
      .mockResolvedValueOnce({
        effects: [{ id: 'fx-2', name: 'Sweep' }],
      } as never)

    const docWithTwoCues = (): EditorDocument =>
      ({
        mode: 'cue',
        path: '/cues/file.json',
        file: {
          mode: 'yarg',
          group: { id: 'g', name: 'Group' },
          cues: [
            {
              id: 'cue-1',
              kind: 'lighting',
              effects: [{ effectId: 'fx-1', effectFileId: 'effects-a' }],
            },
            {
              id: 'cue-2',
              kind: 'lighting',
              effects: [{ effectId: 'fx-2', effectFileId: 'effects-a' }],
            },
          ],
        },
      }) as unknown as EditorDocument

    const stableDoc = docWithTwoCues()
    const { result, rerender } = renderHook(
      ({ selectedId }: { selectedId: string }) =>
        useEffectDefinitions(stableDoc, selectedId, 'yarg', groupedEffectFiles),
      { initialProps: { selectedId: 'cue-1' } },
    )

    rerender({ selectedId: 'cue-2' })
    expect(result.current.size).toBe(0)

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.get('fx-2')).toMatchObject({ id: 'fx-2' })

    resolveFirst?.({ effects: [{ id: 'fx-1', name: 'Stale Pulse' }] } as never)
    await waitFor(() => expect(firstSettled).toBe(true))
    expect(result.current.has('fx-1')).toBe(false)
    expect(result.current.get('fx-2')).toMatchObject({ id: 'fx-2' })
  })

  it('clears definitions when effect references change before reload completes', async () => {
    readEffectFile.mockResolvedValue({
      effects: [{ id: 'fx-1', name: 'Pulse' }],
    } as never)

    const docWithChangingRefs = (): EditorDocument =>
      ({
        mode: 'cue',
        path: '/cues/file.json',
        file: {
          mode: 'yarg',
          group: { id: 'g', name: 'Group' },
          cues: [
            {
              id: 'cue-1',
              kind: 'lighting',
              effects: [{ effectId: 'fx-1', effectFileId: 'effects-a' }],
            },
          ],
        },
      }) as unknown as EditorDocument

    const { result, rerender } = renderHook(
      ({ doc }: { doc: EditorDocument }) =>
        useEffectDefinitions(doc, 'cue-1', 'yarg', groupedEffectFiles),
      { initialProps: { doc: docWithChangingRefs() } },
    )

    await waitFor(() => expect(result.current.size).toBe(1))

    const updatedDoc = (): EditorDocument =>
      ({
        mode: 'cue',
        path: '/cues/file.json',
        file: {
          mode: 'yarg',
          group: { id: 'g', name: 'Group' },
          cues: [
            {
              id: 'cue-1',
              kind: 'lighting',
              effects: [{ effectId: 'fx-2', effectFileId: 'effects-a' }],
            },
          ],
        },
      }) as unknown as EditorDocument

    readEffectFile.mockResolvedValueOnce({
      effects: [{ id: 'fx-2', name: 'Sweep' }],
    } as never)

    rerender({ doc: updatedDoc() })
    expect(result.current.size).toBe(0)

    await waitFor(() => expect(result.current.get('fx-2')).toMatchObject({ id: 'fx-2' }))
    expect(result.current.has('fx-1')).toBe(false)
  })

  it('does not reuse stale definitions when revisiting a cue after references changed', async () => {
    readEffectFile
      .mockResolvedValueOnce({ effects: [{ id: 'fx-1', name: 'Pulse' }] } as never)
      .mockResolvedValueOnce({ effects: [{ id: 'fx-2', name: 'Sweep' }] } as never)
      .mockResolvedValueOnce({ effects: [{ id: 'fx-1', name: 'Pulse v2' }] } as never)

    const docWithTwoCues = (): EditorDocument =>
      ({
        mode: 'cue',
        path: '/cues/file.json',
        file: {
          mode: 'yarg',
          group: { id: 'g', name: 'Group' },
          cues: [
            {
              id: 'cue-1',
              kind: 'lighting',
              effects: [{ effectId: 'fx-1', effectFileId: 'effects-a' }],
            },
            {
              id: 'cue-2',
              kind: 'lighting',
              effects: [{ effectId: 'fx-2', effectFileId: 'effects-a' }],
            },
          ],
        },
      }) as unknown as EditorDocument

    const stableDoc = docWithTwoCues()
    const { result, rerender } = renderHook(
      ({ selectedId }: { selectedId: string }) =>
        useEffectDefinitions(stableDoc, selectedId, 'yarg', groupedEffectFiles),
      { initialProps: { selectedId: 'cue-1' } },
    )

    await waitFor(() => expect(result.current.get('fx-1')).toMatchObject({ name: 'Pulse' }))

    rerender({ selectedId: 'cue-2' })
    await waitFor(() => expect(result.current.get('fx-2')).toMatchObject({ name: 'Sweep' }))

    rerender({ selectedId: 'cue-1' })
    expect(result.current.size).toBe(0)

    await waitFor(() => expect(result.current.get('fx-1')).toMatchObject({ name: 'Pulse v2' }))
  })
})
