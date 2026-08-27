/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, jest } from '@jest/globals'
import { useCueEditorNavigation } from './useCueEditorNavigation'

type Args = Parameters<typeof useCueEditorNavigation>[0]

const setup = (overrides: Partial<Args> = {}) => {
  const handleModeChange = jest.fn()
  const setCueKind = jest.fn()
  const closeJsonEditor = jest.fn()
  const setIsDirty = jest.fn()
  const revertCurrentFileToDisk = jest.fn(() => Promise.resolve())

  const args: Args = {
    mode: 'yarg',
    cueKind: 'lighting',
    isEffectMode: false,
    isDirty: false,
    jsonEditorDirty: false,
    setCueKind,
    handleModeChange,
    closeJsonEditor,
    revertCurrentFileToDisk: revertCurrentFileToDisk as () => Promise<void>,
    setIsDirty,
    ...overrides,
  }

  const rendered = renderHook(() => useCueEditorNavigation(args))
  return {
    rendered,
    handleModeChange,
    setCueKind,
    closeJsonEditor,
    setIsDirty,
    revertCurrentFileToDisk,
  }
}

describe('useCueEditorNavigation', () => {
  describe('platform changes', () => {
    it('maps each platform to its lighting cue mode', () => {
      const { rendered, handleModeChange } = setup()

      act(() => rendered.result.current.handleCuePlatformChange('audio'))
      expect(handleModeChange).toHaveBeenCalledWith('audio-cue')

      act(() => rendered.result.current.handleCuePlatformChange('rb3'))
      expect(handleModeChange).toHaveBeenCalledWith('rb3-cue')
    })

    it('maps to motion cue modes while the motion kind is selected', () => {
      const { rendered, handleModeChange } = setup({ cueKind: 'motion' })

      act(() => rendered.result.current.handleCuePlatformChange('yarg'))
      expect(handleModeChange).toHaveBeenCalledWith('yarg-motion-cue')
    })

    it('stays in effect mode for yarg and audio, and lands on a cue for rb3', () => {
      const { rendered, handleModeChange } = setup({ isEffectMode: true })

      act(() => rendered.result.current.handleCuePlatformChange('audio'))
      expect(handleModeChange).toHaveBeenCalledWith('audio-effect')

      act(() => rendered.result.current.handleCuePlatformChange('rb3'))
      expect(handleModeChange).toHaveBeenCalledWith('rb3-cue')
    })
  })

  describe('kind changes', () => {
    it('sets the kind and switches mode', () => {
      const { rendered, handleModeChange, setCueKind } = setup({ mode: 'rb3' })

      act(() => rendered.result.current.handleCueKindChange('motion'))

      expect(setCueKind).toHaveBeenCalledWith('motion')
      expect(handleModeChange).toHaveBeenCalledWith('rb3-motion-cue')
    })

    it('is inert in effect mode, which has no motion side', () => {
      const { rendered, handleModeChange, setCueKind } = setup({ isEffectMode: true })

      act(() => rendered.result.current.handleCueKindChange('motion'))

      expect(setCueKind).not.toHaveBeenCalled()
      expect(handleModeChange).not.toHaveBeenCalled()
    })
  })

  describe('effect toggle', () => {
    it('switches rb3 to the yarg effect platform, where its effects are authored', () => {
      const { rendered, handleModeChange, setCueKind } = setup({ mode: 'rb3' })

      act(() => rendered.result.current.handleEffectToggle(true))

      expect(setCueKind).toHaveBeenCalledWith('lighting')
      expect(handleModeChange).toHaveBeenCalledWith('yarg-effect')
    })

    it('returns to the platform cue when toggled off', () => {
      const { rendered, handleModeChange } = setup({ mode: 'audio', isEffectMode: true })

      act(() => rendered.result.current.handleEffectToggle(false))

      expect(handleModeChange).toHaveBeenCalledWith('audio-cue')
    })
  })

  describe('dirty-state guard', () => {
    it('runs the action immediately when nothing is unsaved', () => {
      const { rendered, closeJsonEditor } = setup()
      const action = jest.fn()

      act(() => rendered.result.current.guardJsonEditorNavigation(action))

      expect(action).toHaveBeenCalledTimes(1)
      expect(closeJsonEditor).toHaveBeenCalledTimes(1)
      expect(rendered.result.current.pendingNavigation).toBeNull()
    })

    it('parks the action while the document is dirty', () => {
      const { rendered } = setup({ isDirty: true })
      const action = jest.fn()

      act(() => rendered.result.current.guardJsonEditorNavigation(action))

      expect(action).not.toHaveBeenCalled()
      expect(rendered.result.current.pendingNavigation).not.toBeNull()
    })

    it('parks the action while the JSON editor is dirty', () => {
      const { rendered } = setup({ jsonEditorDirty: true })
      const action = jest.fn()

      act(() => rendered.result.current.guardJsonEditorNavigation(action))

      expect(action).not.toHaveBeenCalled()
      expect(rendered.result.current.pendingNavigation).not.toBeNull()
    })

    it('discarding reverts to disk, runs the parked action and clears the dirty state', async () => {
      const { rendered, revertCurrentFileToDisk, closeJsonEditor, setIsDirty } = setup({
        isDirty: true,
      })
      const action = jest.fn()
      act(() => rendered.result.current.guardJsonEditorNavigation(action))

      await act(async () => {
        await rendered.result.current.handleDiscardNavigation()
      })

      expect(revertCurrentFileToDisk).toHaveBeenCalledTimes(1)
      expect(action).toHaveBeenCalledTimes(1)
      expect(closeJsonEditor).toHaveBeenCalled()
      expect(setIsDirty).toHaveBeenCalledWith(false)
      expect(rendered.result.current.pendingNavigation).toBeNull()
    })

    it('cancelling drops the parked action without running it', () => {
      const { rendered, revertCurrentFileToDisk } = setup({ isDirty: true })
      const action = jest.fn()
      act(() => rendered.result.current.guardJsonEditorNavigation(action))

      act(() => rendered.result.current.cancelPendingNavigation())

      expect(action).not.toHaveBeenCalled()
      expect(revertCurrentFileToDisk).not.toHaveBeenCalled()
      expect(rendered.result.current.pendingNavigation).toBeNull()
    })

    it('discarding with nothing parked is a no-op', async () => {
      const { rendered, revertCurrentFileToDisk } = setup()

      await act(async () => {
        await rendered.result.current.handleDiscardNavigation()
      })

      expect(revertCurrentFileToDisk).not.toHaveBeenCalled()
    })
  })
})
