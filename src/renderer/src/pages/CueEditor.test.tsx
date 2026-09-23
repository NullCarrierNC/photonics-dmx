/** @jest-environment jsdom */
/**
 * The page's delete confirmation, with the hooks and the workspace behind it stubbed. The title
 * comes from the toolbar label, so a cue file and an effect file each name themselves.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'

jest.mock('reactflow/dist/style.css', () => ({}))

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock('../components/cue-editor/components/CueEditorWorkspace', () => ({
  __esModule: true,
  default: () => null,
}))

const mockHandleDelete = jest.fn(async () => undefined)
const mockEmptySet = new Set<string>()
const mockEmptyMap = new Map()
const mockFlow = {
  nodes: [],
  setNodes: jest.fn(),
  edges: [],
  loadCueIntoFlow: jest.fn(),
  reactFlowInstance: null,
}
let mockJson = {
  showJsonEditor: false,
  jsonEditorDirty: false,
  closeJsonEditor: jest.fn(),
  getUpdatedDocument: () => null,
}
const mockNavigation = {
  handleCuePlatformChange: jest.fn(),
  handleCueKindChange: jest.fn(),
  handleEffectToggle: jest.fn(),
  guardJsonEditorNavigation: (proceed: () => void) => proceed(),
  pendingNavigation: null,
  handleDiscardNavigation: jest.fn(),
  cancelPendingNavigation: jest.fn(),
}
let mockFiles: Record<string, unknown> = {}

jest.mock('../components/cue-editor/hooks/useCueFiles', () => ({ useCueFiles: () => mockFiles }))
jest.mock('../components/cue-editor/hooks/useCueFlow', () => ({ useCueFlow: () => mockFlow }))
jest.mock('../components/cue-editor/hooks/useCueJsonEditor', () => ({
  useCueJsonEditor: () => mockJson,
}))
jest.mock('../components/cue-editor/hooks/useCueEditorNavigation', () => ({
  useCueEditorNavigation: () => mockNavigation,
}))
jest.mock('../components/cue-editor/hooks/useCueRegistryPanel', () => ({
  useCueRegistryPanel: () => ({}),
}))
jest.mock('../components/cue-editor/hooks/useActiveNodes', () => ({
  useActiveNodes: () => mockEmptySet,
}))
jest.mock('../components/cue-editor/hooks/useErrorNodes', () => ({
  useErrorNodes: () => mockEmptySet,
}))
jest.mock('../components/cue-editor/hooks/useLevelModeWarnings', () => ({
  useLevelModeWarnings: () => ({ warningNodeIds: mockEmptySet, warningMessages: [] }),
}))
jest.mock('../components/cue-editor/hooks/useEffectDefinitions', () => ({
  useEffectDefinitions: () => mockEmptyMap,
}))

import CueEditor from './CueEditor'

/** What useCueFiles reports with one saved file open in the given editor mode. */
function filesFor(editorMode: 'cue' | 'effect'): Record<string, unknown> {
  return {
    mode: 'yarg',
    cueKind: 'lighting',
    setCueKind: jest.fn(),
    activeMode: 'yarg',
    editorMode,
    groupedFiles: { yarg: [], audio: [], rb3: [] },
    groupedEffectFiles: { yarg: [], audio: [] },
    editorDoc: {
      mode: editorMode,
      path: '/files/stage.json',
      file: { mode: 'yarg', group: { id: 'stage', name: 'Stage' }, cues: [], effects: [] },
    },
    selectedCueId: null,
    filename: 'stage.json',
    availableCueTypes: [],
    validationErrors: [],
    isDirty: false,
    currentCueDefinition: null,
    currentEffectDefinition: null,
    setSelectedCueId: jest.fn(),
    setEditorDoc: jest.fn(),
    setIsDirty: jest.fn(),
    handleDelete: mockHandleDelete,
    pendingImport: null,
    existingGroupIdsForNewFileModal: new Set(),
    existingGroupIdsForImportModal: new Set(),
    existingFilenamesLowerForImportModal: new Set(),
  }
}

function openDeletePrompt(editorMode: 'cue' | 'effect', label: string): HTMLElement {
  mockFiles = filesFor(editorMode)
  renderWithProviders(<CueEditor />)
  fireEvent.click(screen.getByRole('button', { name: label }))
  return screen.getByRole('alertdialog', { name: `${label}?` })
}

beforeEach(() => {
  mockHandleDelete.mockClear()
})

describe('CueEditor delete confirmation', () => {
  it.each([
    ['cue', 'Delete Cue File'],
    ['effect', 'Delete Effect File'],
  ] as const)('asks before deleting the open %s file', (editorMode, label) => {
    const dialog = openDeletePrompt(editorMode, label)
    expect(dialog).toHaveTextContent('stage.json')
    expect(mockHandleDelete).not.toHaveBeenCalled()
  })

  it('deletes the file once confirmed', () => {
    const dialog = openDeletePrompt('cue', 'Delete Cue File')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mockHandleDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps the file when the prompt is cancelled', () => {
    const dialog = openDeletePrompt('cue', 'Delete Cue File')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mockHandleDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('CueEditor close guard', () => {
  const cleanJson = mockJson

  afterEach(() => {
    mockJson = cleanJson
  })

  /** Fires the event a window close or reload sends the page and reports whether it asked. */
  function closeAsks(): boolean {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('asks before the window closes while the graph has unsaved changes', () => {
    mockFiles = { ...filesFor('cue'), isDirty: true }
    renderWithProviders(<CueEditor />)

    expect(closeAsks()).toBe(true)
  })

  it('asks while the JSON editor holds unsaved text', () => {
    mockFiles = filesFor('cue')
    mockJson = { ...cleanJson, showJsonEditor: true, jsonEditorDirty: true }
    renderWithProviders(<CueEditor />)

    expect(closeAsks()).toBe(true)
  })

  it('stops asking once the changes are saved', () => {
    mockFiles = { ...filesFor('cue'), isDirty: true }
    const view = renderWithProviders(<CueEditor />)
    mockFiles = filesFor('cue')
    view.rerender(<CueEditor />)

    expect(closeAsks()).toBe(false)
  })
})
