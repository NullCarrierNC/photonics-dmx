/** @jest-environment jsdom */
/**
 * ConfirmModal keyboard handling.
 *
 * Every caller of this dialog passes `danger: true`: discard unsaved menu changes, delete a light,
 * discard light changes, discard layout changes, delete a rig. So a key that reaches the wrong
 * button destroys something the user has, which is what these cover.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import ConfirmModal from './ConfirmModal'

afterEach(() => cleanup())

function open(overrides: Partial<Parameters<typeof ConfirmModal>[0]> = {}): {
  onConfirm: jest.Mock
  onCancel: jest.Mock
} {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  renderWithProviders(
    <ConfirmModal
      isOpen
      title="Delete rig"
      message="This cannot be undone."
      confirmLabel="Delete rig"
      cancelLabel="Cancel"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmModal', () => {
  it('cancels on Enter from the Cancel button', () => {
    const { onConfirm, onCancel } = open()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()

    fireEvent.keyDown(cancel, { key: 'Enter' })
    fireEvent.click(cancel)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('confirms on Enter from the Confirm button', () => {
    const { onConfirm, onCancel } = open()
    const confirm = screen.getByRole('button', { name: 'Delete rig' })
    confirm.focus()

    fireEvent.keyDown(confirm, { key: 'Enter' })
    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const { onConfirm, onCancel } = open()

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels on a click outside the panel', () => {
    const { onCancel } = open()

    fireEvent.click(screen.getByRole('presentation'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the dialog', () => {
    open()
    const confirm = screen.getByRole('button', { name: 'Delete rig' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })

    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(confirm).toHaveFocus()

    fireEvent.keyDown(confirm, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
  })

  it('gives focus back to whatever opened it', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = renderWithProviders(
      <ConfirmModal
        isOpen
        title="Discard changes"
        message="Unsaved edits will be lost."
        danger
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    )
    expect(opener).not.toHaveFocus()

    unmount()

    expect(opener).toHaveFocus()
    opener.remove()
  })
})
