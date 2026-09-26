/** @jest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { ReactFlowProvider, type NodeChange } from 'reactflow'
import CueFlowCanvas from './CueFlowCanvas'
import Modal from '../../Modal'
import type { EditorNode } from '../lib/types'

beforeAll(() => {
  // React Flow measures its pane, and jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

afterEach(() => cleanup())

const selectedNote: EditorNode = {
  id: 'note-1',
  position: { x: 0, y: 0 },
  selected: true,
  data: {
    kind: 'notes',
    label: 'Note',
    payload: { id: 'note-1', type: 'notes', note: 'Keep me' },
  },
}

function renderCanvas(dialogOpen: boolean) {
  const onNodesChange = jest.fn<(changes: NodeChange[]) => void>()
  render(
    <>
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowProvider>
          <CueFlowCanvas
            nodes={[selectedNote]}
            edges={[]}
            nodeTypes={{}}
            contextMenu={null}
            paneContextMenu={null}
            flowWrapperRef={createRef<HTMLDivElement>()}
            onNodesChange={onNodesChange}
            onEdgesChange={jest.fn()}
            onConnect={jest.fn()}
            onSelectionChange={jest.fn()}
            onNodeContextMenu={jest.fn()}
            onEdgeContextMenu={jest.fn()}
            onPaneClick={jest.fn()}
            onPaneContextMenu={jest.fn()}
            onRemoveNode={jest.fn()}
            setReactFlowInstance={jest.fn()}
            isValidConnection={() => true}
            activeMode="yarg"
            editorMode="cue"
            addEventNode={jest.fn()}
            addActionNode={jest.fn()}
            addLogicNode={jest.fn()}
          />
        </ReactFlowProvider>
      </div>
      {dialogOpen && (
        <Modal onClose={() => {}} panelClassName="panel">
          <button type="button">OK</button>
        </Modal>
      )}
    </>,
  )
  return onNodesChange
}

/** Presses and releases Backspace with the page body as the target. */
async function pressBackspaceOnBody(): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Backspace', code: 'Backspace' })
  })
  await act(async () => {
    fireEvent.keyUp(document.body, { key: 'Backspace', code: 'Backspace' })
  })
}

function removedIds(onNodesChange: jest.Mock<(changes: NodeChange[]) => void>): string[] {
  return onNodesChange.mock.calls
    .flat(2)
    .flatMap((change) => (change.type === 'remove' ? [change.id] : []))
}

describe('CueFlowCanvas', () => {
  it('deletes the selected node on Backspace', async () => {
    const onNodesChange = renderCanvas(false)

    await pressBackspaceOnBody()

    expect(removedIds(onNodesChange)).toEqual(['note-1'])
  })

  it('ignores Backspace while a dialog is open, wherever focus sits', async () => {
    const onNodesChange = renderCanvas(true)

    await pressBackspaceOnBody()

    expect(removedIds(onNodesChange)).toEqual([])
  })
})
