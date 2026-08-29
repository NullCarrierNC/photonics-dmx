/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, jest } from '@jest/globals'
import type { Edge, Node, ReactFlowInstance } from 'reactflow'

const updateDocumentFromFlow = jest.fn()
const updateEffectDocumentFromFlow = jest.fn()
const layoutGraph = jest.fn()

jest.mock('../lib/cueTransforms', () => ({
  updateDocumentFromFlow: (...args: unknown[]) => updateDocumentFromFlow(...args),
  updateEffectDocumentFromFlow: (...args: unknown[]) => updateEffectDocumentFromFlow(...args),
}))

jest.mock('../lib/graphPrettier', () => ({
  layoutGraph: (...args: unknown[]) => layoutGraph(...args),
}))

import { useCueJsonEditor } from './useCueJsonEditor'
import type { EditorDocument } from '../lib/types'

type Args = Parameters<typeof useCueJsonEditor>[0]

const cueDoc = (): EditorDocument =>
  ({
    mode: 'cue',
    path: '/cues/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'g', name: 'Group' },
      cues: [{ id: 'cue-1', kind: 'lighting', nodes: { logic: [] } }],
    },
  }) as unknown as EditorDocument

const effectDoc = (): EditorDocument =>
  ({
    mode: 'effect',
    path: '/effects/file.json',
    file: {
      mode: 'yarg',
      effects: [{ id: 'fx-1', nodes: { logic: [] } }],
    },
  }) as unknown as EditorDocument

const cueDefinition = {
  id: 'cue-1',
  kind: 'lighting',
  nodes: { logic: [] },
  connections: [],
} as unknown as Args['currentCueDefinition']

const effectDefinition = {
  id: 'fx-1',
  mode: 'yarg',
  name: 'Pulse',
  nodes: { logic: [] },
  connections: [],
} as unknown as Args['currentEffectDefinition']

const setup = (overrides: Partial<Args> = {}) => {
  const setNodes = jest.fn()
  const setEditorDoc = jest.fn()
  const setSelectedCueId = jest.fn()
  const setCueKind = jest.fn()
  const setIsDirty = jest.fn()
  const loadCueIntoFlow = jest.fn()
  const reactFlowInstance = {
    setViewport: jest.fn(),
  } as unknown as ReactFlowInstance

  const args: Args = {
    editorDoc: cueDoc(),
    selectedCueId: 'cue-1',
    currentCueDefinition: cueDefinition,
    currentEffectDefinition: null,
    nodes: [
      { id: 'node-1', position: { x: 0, y: 0 }, data: { kind: 'logic', payload: {} } },
    ] as Node[],
    edges: [] as Edge[],
    reactFlowInstance,
    setNodes,
    setEditorDoc,
    setSelectedCueId,
    setCueKind,
    setIsDirty,
    loadCueIntoFlow,
    ...overrides,
  }

  const rendered = renderHook(() => useCueJsonEditor(args))
  return {
    rendered,
    setNodes,
    setEditorDoc,
    setSelectedCueId,
    setCueKind,
    setIsDirty,
    loadCueIntoFlow,
    reactFlowInstance,
  }
}

describe('useCueJsonEditor', () => {
  beforeEach(() => {
    updateDocumentFromFlow.mockReset()
    updateEffectDocumentFromFlow.mockReset()
    layoutGraph.mockReset()
  })

  describe('getUpdatedDocument', () => {
    it('merges cue flow state through updateDocumentFromFlow', () => {
      const merged = { group: { id: 'g' }, cues: [{ id: 'cue-1' }] }
      updateDocumentFromFlow.mockReturnValue(merged)
      const { rendered } = setup()

      expect(rendered.result.current.getUpdatedDocument()).toBe(merged)
      expect(updateDocumentFromFlow).toHaveBeenCalledTimes(1)
      expect(updateEffectDocumentFromFlow).not.toHaveBeenCalled()
    })

    it('merges effect flow state through updateEffectDocumentFromFlow', () => {
      const merged = { mode: 'yarg', effects: [{ id: 'fx-1' }] }
      updateEffectDocumentFromFlow.mockReturnValue(merged)
      const { rendered } = setup({
        editorDoc: effectDoc(),
        selectedCueId: 'fx-1',
        currentCueDefinition: null,
        currentEffectDefinition: effectDefinition,
      })

      expect(rendered.result.current.getUpdatedDocument()).toBe(merged)
      expect(updateEffectDocumentFromFlow).toHaveBeenCalledTimes(1)
      expect(updateDocumentFromFlow).not.toHaveBeenCalled()
    })
  })

  describe('save handlers', () => {
    it('writes an updated cue into the document and follows a regenerated id', () => {
      const { rendered, setEditorDoc, setSelectedCueId, loadCueIntoFlow, setIsDirty } = setup()
      const updatedCue = { ...cueDefinition, id: 'cue-2' }

      act(() =>
        rendered.result.current.handleJsonEditorSave(
          updatedCue as NonNullable<typeof cueDefinition>,
        ),
      )

      expect(setEditorDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'cue',
          file: expect.objectContaining({
            cues: [expect.objectContaining({ id: 'cue-2' })],
          }),
        }),
      )
      expect(setSelectedCueId).toHaveBeenCalledWith('cue-2')
      expect(loadCueIntoFlow).toHaveBeenCalledWith(updatedCue)
      expect(setIsDirty).toHaveBeenCalledWith(true)
      expect(rendered.result.current.showJsonEditor).toBe(false)
    })

    it('writes an updated effect into the document and follows a regenerated id', () => {
      const { rendered, setEditorDoc, setSelectedCueId, loadCueIntoFlow, setIsDirty } = setup({
        editorDoc: effectDoc(),
        selectedCueId: 'fx-1',
        currentCueDefinition: null,
        currentEffectDefinition: effectDefinition,
      })
      const updatedEffect = { ...effectDefinition, id: 'fx-2' }

      act(() =>
        rendered.result.current.handleJsonEffectSave(
          updatedEffect as NonNullable<typeof effectDefinition>,
        ),
      )

      expect(setEditorDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'effect',
          file: expect.objectContaining({
            effects: [expect.objectContaining({ id: 'fx-2' })],
          }),
        }),
      )
      expect(setSelectedCueId).toHaveBeenCalledWith('fx-2')
      expect(loadCueIntoFlow).toHaveBeenCalledWith(updatedEffect)
      expect(setIsDirty).toHaveBeenCalledWith(true)
    })

    it('ignores cue saves without a document, wrong mode, or selection', () => {
      const { rendered, setEditorDoc, setSelectedCueId, loadCueIntoFlow, setIsDirty } = setup({
        editorDoc: null,
        selectedCueId: null,
      })

      act(() =>
        rendered.result.current.handleJsonEditorSave(
          cueDefinition as NonNullable<typeof cueDefinition>,
        ),
      )

      expect(setEditorDoc).not.toHaveBeenCalled()
      expect(setSelectedCueId).not.toHaveBeenCalled()
      expect(loadCueIntoFlow).not.toHaveBeenCalled()
      expect(setIsDirty).not.toHaveBeenCalled()

      const effectMode = setup({
        editorDoc: effectDoc(),
        selectedCueId: 'fx-1',
        currentCueDefinition: null,
        currentEffectDefinition: effectDefinition,
      })

      act(() =>
        effectMode.rendered.result.current.handleJsonEditorSave(
          cueDefinition as NonNullable<typeof cueDefinition>,
        ),
      )

      expect(effectMode.setEditorDoc).not.toHaveBeenCalled()
    })

    it('synchronises cue kind before updating the document when kind changes in JSON', () => {
      const { rendered, setCueKind, setEditorDoc } = setup()
      const updatedCue = { ...cueDefinition, kind: 'motion' as const }

      act(() =>
        rendered.result.current.handleJsonEditorSave(
          updatedCue as NonNullable<typeof cueDefinition>,
        ),
      )

      expect(setCueKind).toHaveBeenCalledWith('motion')
      expect(setCueKind.mock.invocationCallOrder[0]).toBeLessThan(
        setEditorDoc.mock.invocationCallOrder[0],
      )
    })

    it('ignores cue saves when selectedCueId is null in cue mode', () => {
      const { rendered, setEditorDoc, setCueKind } = setup({ selectedCueId: null })

      act(() =>
        rendered.result.current.handleJsonEditorSave(
          cueDefinition as NonNullable<typeof cueDefinition>,
        ),
      )

      expect(setCueKind).not.toHaveBeenCalled()
      expect(setEditorDoc).not.toHaveBeenCalled()
    })

    it('ignores effect saves without a document, wrong mode, or selection', () => {
      const { rendered, setEditorDoc, setSelectedCueId, loadCueIntoFlow, setIsDirty } = setup({
        editorDoc: effectDoc(),
        selectedCueId: null,
        currentCueDefinition: null,
        currentEffectDefinition: effectDefinition,
      })

      act(() =>
        rendered.result.current.handleJsonEffectSave(
          effectDefinition as NonNullable<typeof effectDefinition>,
        ),
      )

      expect(setEditorDoc).not.toHaveBeenCalled()
      expect(setSelectedCueId).not.toHaveBeenCalled()
      expect(loadCueIntoFlow).not.toHaveBeenCalled()
      expect(setIsDirty).not.toHaveBeenCalled()
    })
  })

  describe('closeJsonEditor', () => {
    it('clears the dirty flag when closing the JSON editor', () => {
      const { rendered } = setup()

      act(() => rendered.result.current.setShowJsonEditor(true))
      act(() => rendered.result.current.setJsonEditorDirty(true))

      act(() => rendered.result.current.closeJsonEditor())

      expect(rendered.result.current.showJsonEditor).toBe(false)
      expect(rendered.result.current.jsonEditorDirty).toBe(false)
    })
  })

  describe('handleGraphPrettify', () => {
    it('applies layout positions and viewport, then marks the document dirty', () => {
      layoutGraph.mockReturnValue({
        nodePositions: { 'node-1': { x: 120, y: 240 } },
        viewport: { x: 10, y: 20, zoom: 1.25 },
      })
      const { rendered, setNodes, reactFlowInstance, setIsDirty } = setup()

      act(() => rendered.result.current.handleGraphPrettify())

      expect(layoutGraph).toHaveBeenCalledWith(
        'cue-1',
        cueDefinition?.nodes,
        cueDefinition?.connections,
        {},
      )
      expect(setNodes).toHaveBeenCalledTimes(1)
      const updater = setNodes.mock.calls[0][0] as (nodes: Node[]) => Node[]
      expect(
        updater([
          { id: 'node-1', position: { x: 0, y: 0 }, data: { kind: 'logic', payload: {} } },
        ] as Node[]),
      ).toEqual([
        { id: 'node-1', position: { x: 120, y: 240 }, data: { kind: 'logic', payload: {} } },
      ])
      expect(reactFlowInstance.setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 1.25 })
      expect(setIsDirty).toHaveBeenCalledWith(true)
    })

    it('does nothing when there is no current definition', () => {
      const { rendered, setNodes, setIsDirty } = setup({ currentCueDefinition: null })

      act(() => rendered.result.current.handleGraphPrettify())

      expect(layoutGraph).not.toHaveBeenCalled()
      expect(setNodes).not.toHaveBeenCalled()
      expect(setIsDirty).not.toHaveBeenCalled()
    })

    it('does nothing when layout returns no node positions', () => {
      layoutGraph.mockReturnValue({ viewport: { x: 0, y: 0, zoom: 1 } })
      const { rendered, setNodes, setIsDirty } = setup()

      act(() => rendered.result.current.handleGraphPrettify())

      expect(setNodes).not.toHaveBeenCalled()
      expect(setIsDirty).not.toHaveBeenCalled()
    })

    it('prettifies an effect graph in effect mode', () => {
      layoutGraph.mockReturnValue({
        nodePositions: { 'node-1': { x: 80, y: 160 } },
        viewport: { x: 5, y: 10, zoom: 1.5 },
      })
      const { rendered, setNodes, reactFlowInstance, setIsDirty } = setup({
        editorDoc: effectDoc(),
        selectedCueId: 'fx-1',
        currentCueDefinition: null,
        currentEffectDefinition: effectDefinition,
      })

      act(() => rendered.result.current.handleGraphPrettify())

      expect(layoutGraph).toHaveBeenCalledWith(
        'fx-1',
        effectDefinition?.nodes,
        effectDefinition?.connections,
        {},
      )
      expect(setNodes).toHaveBeenCalledTimes(1)
      expect(reactFlowInstance.setViewport).toHaveBeenCalledWith({ x: 5, y: 10, zoom: 1.5 })
      expect(setIsDirty).toHaveBeenCalledWith(true)
    })
  })
})
