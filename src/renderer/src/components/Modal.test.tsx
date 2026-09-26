/** @jest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals'
import type { KeyboardEvent, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ReactFlow, { ReactFlowProvider, type Node, type NodeChange } from 'reactflow'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import Modal, { type ModalProps } from './Modal'

afterEach(() => cleanup())

const form = (
  <>
    <h2 id="title">Title</h2>
    <input aria-label="Name" />
    <button type="button" disabled>
      Unavailable
    </button>
    <button type="button">Save</button>
  </>
)

function open(props: Partial<ModalProps> = {}, children: ReactNode = form) {
  const onClose = jest.fn()
  const view = renderWithProviders(
    <Modal onClose={onClose} labelledBy="title" panelClassName="panel" {...props}>
      {children}
    </Modal>,
  )
  return { onClose, ...view }
}

/** A press and release on one element, which is what a click on it takes. */
function clickOn(element: HTMLElement, detail = 1): void {
  fireEvent.mouseDown(element, { detail })
  fireEvent.mouseUp(element, { detail })
  fireEvent.click(element, { detail })
}

describe('Modal', () => {
  it.each(['dialog', 'alertdialog'] as const)('is a modal %s named by its title', (role) => {
    open({ role })
    expect(screen.getByRole(role, { name: 'Title' })).toHaveAttribute('aria-modal', 'true')
  })

  it('takes focus as it opens and gives it back when it goes', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = open()
    expect(screen.getByRole('dialog')).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('leaves focus on a control that took it as the dialog opened', () => {
    open({}, <input aria-label="Name" autoFocus />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('takes focus back when a control inside blurs to the page body', async () => {
    open()
    const name = screen.getByRole('textbox', { name: 'Name' })
    name.focus()

    await act(async () => {
      name.blur()
    })

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes on Escape from inside the panel', () => {
    const { onClose } = open()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('lets the dialog claim a key before Escape', () => {
    const onKeyDown = jest.fn((event: KeyboardEvent<HTMLDivElement>) => event.preventDefault())
    const { onClose } = open({ onKeyDown })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves Enter to the focused control', () => {
    const { onClose } = open()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Save' }), { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on a click on the backdrop and not on one inside the panel', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps typed input through a backdrop click and Escape when it is not dismissible', () => {
    const { onClose } = open({ dismissible: false })
    const name = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'typed' } })

    clickOn(screen.getByRole('presentation'))
    fireEvent.keyDown(name, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(name).toHaveValue('typed')
  })

  it('keeps Tab inside the panel and skips disabled controls', () => {
    open()
    const name = screen.getByRole('textbox', { name: 'Name' })
    const save = screen.getByRole('button', { name: 'Save' })

    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(name).toHaveFocus()

    fireEvent.keyDown(name, { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()
  })
})

describe('Modal over a React Flow graph', () => {
  beforeAll(() => {
    // React Flow measures its pane, and jsdom has no ResizeObserver.
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  })

  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, selected: true },
  ]

  it('keeps Backspace pressed inside the dialog away from the selected node', async () => {
    const onNodesChange = jest.fn<(changes: NodeChange[]) => void>()
    render(
      <>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} />
          </ReactFlowProvider>
        </div>
        <Modal onClose={() => {}} panelClassName="panel">
          <button type="button">Delete</button>
        </Modal>
      </>,
    )
    const panel = screen.getByRole('dialog')

    await act(async () => {
      fireEvent.keyDown(panel, { key: 'Backspace', code: 'Backspace' })
    })
    await act(async () => {
      fireEvent.keyUp(panel, { key: 'Backspace', code: 'Backspace' })
    })

    const removed = onNodesChange.mock.calls.flat(2).filter((change) => change.type === 'remove')
    expect(removed).toEqual([])
  })
})
