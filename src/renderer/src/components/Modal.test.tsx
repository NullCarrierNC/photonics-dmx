/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { KeyboardEvent, ReactNode } from 'react'
import { cleanup, fireEvent, screen } from '@testing-library/react'
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

  it('stays open on a backdrop click when closeOnBackdrop is off', () => {
    const { onClose } = open({ closeOnBackdrop: false })
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).not.toHaveBeenCalled()
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
