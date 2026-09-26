/** @jest-environment jsdom */
import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { useConfirm } from '../hooks/useConfirm'
import { confirmRequestAtom } from '../atoms'
import ConfirmModalHost from './ConfirmModalHost'

afterEach(() => cleanup())

function DeleteButton(): JSX.Element {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('none')
  const ask = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Delete rig?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    setAnswer(ok ? 'yes' : 'no')
  }
  return (
    <>
      <button type="button" onClick={() => void ask()}>
        Remove
      </button>
      <output>{answer}</output>
    </>
  )
}

function renderPage() {
  return renderWithProviders(
    <>
      <DeleteButton />
      <ConfirmModalHost />
    </>,
  )
}

describe('ConfirmModalHost', () => {
  it('shows the question a caller asks', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete rig?')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This cannot be undone.')
  })

  it('answers yes when the confirm button is clicked, and closes', async () => {
    const { store } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('yes'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(store.get(confirmRequestAtom)).toBeNull()
  })

  it('answers no when the cancel button is clicked, and closes', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks again after the first question is answered', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('yes'))
  })

  it('keeps the prompt open when a double click on Remove lands its second click on the backdrop', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }), { detail: 1 })

    const backdrop = screen.getByRole('presentation')
    fireEvent.mouseDown(backdrop, { detail: 2 })
    fireEvent.mouseUp(backdrop, { detail: 2 })
    fireEvent.click(backdrop, { detail: 2 })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('none')
  })
})
