/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, jest } from '@jest/globals'
import { useCueRegistryPanel } from './useCueRegistryPanel'
import type { EditorDocument } from '../lib/types'
import type { VariableDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

type Args = Parameters<typeof useCueRegistryPanel>[0]

const cueDoc = (): EditorDocument =>
  ({
    mode: 'cue',
    path: '/cues/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'g', name: 'Group', variables: [{ name: 'gvar', type: 'number' }] },
      cues: [
        {
          id: 'cue-1',
          kind: 'lighting',
          variables: [{ name: 'cvar', type: 'string', validValues: ['a'] }],
          events: [{ name: 'evt' }],
          effects: [{ effectId: 'fx-1', name: 'Pulse', effectFileId: 'effects-a' }],
          nodes: { logic: [] },
        },
      ],
    },
  }) as unknown as EditorDocument

const effectDoc = (): EditorDocument =>
  ({
    mode: 'effect',
    path: '/effects/file.json',
    file: { mode: 'yarg', effects: [{ id: 'fx-1' }] },
  }) as unknown as EditorDocument

const setup = (overrides: Partial<Args> = {}) => {
  const updateGroupMeta = jest.fn()
  const updateCueMetadata = jest.fn()
  const updateEffectMetadata = jest.fn()

  const args: Args = {
    editorDoc: cueDoc(),
    selectedCueId: 'cue-1',
    activeMode: 'yarg',
    nodes: [],
    currentEffectDefinition: null,
    loadedEffectDefinitions: new Map(),
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
    ...overrides,
  }

  const rendered = renderHook(() => useCueRegistryPanel(args))
  return { rendered, updateGroupMeta, updateCueMetadata, updateEffectMetadata }
}

describe('useCueRegistryPanel', () => {
  it('starts on the variables tab and switches', () => {
    const { rendered } = setup()
    expect(rendered.result.current.registryTab).toBe('variables')

    act(() => rendered.result.current.setRegistryTab('events'))
    expect(rendered.result.current.registryTab).toBe('events')
  })

  describe('derivation in cue mode', () => {
    it('combines group and cue variables with their scopes', () => {
      const { rendered } = setup()

      expect(rendered.result.current.availableVariables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'gvar', scope: 'cue-group' }),
          expect.objectContaining({ name: 'cvar', scope: 'cue', validValues: ['a'] }),
        ]),
      )
    })

    it('lists the cue events and effects, resolving loaded definitions', () => {
      const definition = { id: 'fx-1', name: 'Pulse' }
      const { rendered } = setup({
        loadedEffectDefinitions: new Map([['fx-1', definition]]) as Args['loadedEffectDefinitions'],
      })

      expect(rendered.result.current.availableEvents).toEqual(['evt'])
      expect(rendered.result.current.availableEffects).toEqual([
        { id: 'fx-1', name: 'Pulse', definition },
      ])
    })

    it('leaves an effect without a loaded definition undefined rather than dropping it', () => {
      const { rendered } = setup()
      expect(rendered.result.current.availableEffects).toEqual([
        { id: 'fx-1', name: 'Pulse', definition: undefined },
      ])
    })

    it('derives nothing without a document or selection', () => {
      const { rendered } = setup({ editorDoc: null })
      expect(rendered.result.current.availableVariables).toEqual([])
      expect(rendered.result.current.availableEvents).toEqual([])
      expect(rendered.result.current.availableEffects).toEqual([])
    })
  })

  describe('derivation in effect mode', () => {
    it('treats the effect variables as cue-scoped and exposes no events or effects', () => {
      const { rendered } = setup({
        editorDoc: effectDoc(),
        currentEffectDefinition: {
          id: 'fx-1',
          variables: [{ name: 'evar', type: 'number' }],
          nodes: { logic: [] },
        } as unknown as Args['currentEffectDefinition'],
      })

      expect(rendered.result.current.availableVariables).toEqual([
        expect.objectContaining({ name: 'evar', scope: 'cue' }),
      ])
      expect(rendered.result.current.availableEvents).toEqual([])
      expect(rendered.result.current.availableEffects).toEqual([])
    })
  })

  describe('mutations', () => {
    it('writes group and cue variables separately in cue mode', () => {
      const { rendered, updateGroupMeta, updateCueMetadata } = setup()
      const groupVars = [
        { name: 'gvar', type: 'number', scope: 'cue-group', initialValue: 0 },
      ] as VariableDefinition[]
      const cueVars = [
        { name: 'cvar', type: 'string', scope: 'cue', initialValue: '' },
      ] as VariableDefinition[]

      act(() => rendered.result.current.handleVariablesChange(groupVars, cueVars))

      expect(updateGroupMeta).toHaveBeenCalledWith({ variables: groupVars })
      expect(updateCueMetadata).toHaveBeenCalledWith({ variables: cueVars })
    })

    it('writes only effect variables in effect mode', () => {
      const { rendered, updateGroupMeta, updateEffectMetadata } = setup({ editorDoc: effectDoc() })
      const cueVars = [
        { name: 'evar', type: 'number', scope: 'cue', initialValue: 0 },
      ] as VariableDefinition[]

      act(() => rendered.result.current.handleVariablesChange([], cueVars))

      expect(updateGroupMeta).not.toHaveBeenCalled()
      expect(updateEffectMetadata).toHaveBeenCalledWith({ variables: cueVars })
    })

    it('syncs valid values onto the matching variable in its scope', () => {
      const { rendered, updateGroupMeta, updateCueMetadata } = setup()

      act(() => rendered.result.current.handleSyncVariableValidValues('gvar', 'cue-group', ['x']))
      expect(updateGroupMeta).toHaveBeenCalledWith({
        variables: [expect.objectContaining({ name: 'gvar', validValues: ['x'] })],
      })

      act(() => rendered.result.current.handleSyncVariableValidValues('cvar', 'cue', ['y']))
      expect(updateCueMetadata).toHaveBeenCalledWith({
        variables: [expect.objectContaining({ name: 'cvar', validValues: ['y'] })],
      })
    })

    it('writes events and effects onto the cue', () => {
      const { rendered, updateCueMetadata } = setup()
      const events = [{ name: 'evt2' }] as Parameters<
        typeof rendered.result.current.handleEventsChange
      >[0]
      const effects = [{ effectId: 'fx-2', name: 'Sweep' }] as Parameters<
        typeof rendered.result.current.handleEffectsChange
      >[0]

      act(() => rendered.result.current.handleEventsChange(events))
      act(() => rendered.result.current.handleEffectsChange(effects))

      expect(updateCueMetadata).toHaveBeenCalledWith({ events })
      expect(updateCueMetadata).toHaveBeenCalledWith({ effects })
    })

    it('ignores mutations without a document', () => {
      const { rendered, updateCueMetadata, updateGroupMeta } = setup({ editorDoc: null })

      act(() => rendered.result.current.handleVariablesChange([], []))
      act(() => rendered.result.current.handleSyncVariableValidValues('gvar', 'cue-group', ['x']))

      expect(updateGroupMeta).not.toHaveBeenCalled()
      expect(updateCueMetadata).not.toHaveBeenCalled()
    })
  })
})
