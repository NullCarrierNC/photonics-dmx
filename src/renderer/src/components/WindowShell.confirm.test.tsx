/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import { useConfirm } from '../hooks/useConfirm'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

import WindowShell from './WindowShell'

beforeEach(() => {
  resetIpcApiMock()
  resetIpcListenerStub()
  ipcApiMock.getSystemStatus.mockResolvedValue({ success: true } as never)
  ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
})

afterEach(() => cleanup())

function AskButton(): JSX.Element {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('none')
  const ask = async (): Promise<void> => {
    setAnswer((await confirm({ title: 'Delete variable', message: 'Sure?' })) ? 'yes' : 'no')
  }
  return (
    <>
      <button type="button" onClick={() => void ask()}>
        Ask
      </button>
      <output>{answer}</output>
    </>
  )
}

describe('confirm prompts in every window', () => {
  it('shows a prompt raised by whatever the window renders and returns the answer', async () => {
    renderWithProviders(
      <WindowShell>
        <AskButton />
      </WindowShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    const prompt = await screen.findByRole('alertdialog')
    expect(prompt).toHaveTextContent('Delete variable')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('yes'))
  })
})
