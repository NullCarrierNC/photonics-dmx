/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { EditorDocument } from '../lib/types'
import { createDefaultFile } from '../lib/cueDefaults'
import ConfirmModalHost from '../../ConfirmModalHost'
import { ToastStack } from '../../Toast'

jest.mock(
  '../../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

import EventRegistry from './EventRegistry'
import EffectRegistry from './EffectRegistry'

afterEach(() => cleanup())

const cueDoc = (): EditorDocument => {
  const file = createDefaultFile('yarg', 'lighting')
  file.cues[0] = {
    ...file.cues[0],
    id: 'cue-1',
    events: [{ name: 'flash' }],
    effects: [{ effectId: 'sweep', effectFileId: 'fx', name: 'Sweep' }],
  }
  return { mode: 'cue', path: '/cues/file.json', file }
}

function withHosts(node: React.ReactNode) {
  renderWithProviders(
    <>
      {node}
      <ToastStack />
      <ConfirmModalHost />
    </>,
  )
}

async function answer(label: string): Promise<void> {
  const prompt = await screen.findByRole('alertdialog')
  fireEvent.click(within(prompt).getByRole('button', { name: label }))
}

describe('EventRegistry dialogs', () => {
  const renderEvents = (references: string[] = []) => {
    const onEventsChange = jest.fn()
    withHosts(
      <EventRegistry
        editorDoc={cueDoc()}
        selectedCueId="cue-1"
        onEventsChange={onEventsChange}
        getEventReferences={() => references}
      />,
    )
    return { onEventsChange }
  }

  it('asks in the window before deleting an event', async () => {
    const { onEventsChange } = renderEvents()

    fireEvent.click(screen.getByRole('button', { name: 'Del' }))
    await answer('Delete')

    expect(onEventsChange).toHaveBeenCalledWith([])
  })

  it('says why an event in use cannot be deleted', async () => {
    const { onEventsChange } = renderEvents(['node-3'])

    fireEvent.click(screen.getByRole('button', { name: 'Del' }))

    expect(await screen.findByText(/referenced by: node-3/)).toBeInTheDocument()
    expect(onEventsChange).not.toHaveBeenCalled()
  })

  it('says so when an event name is taken', async () => {
    renderEvents()

    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByPlaceholderText('eventName'), { target: { value: 'flash' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('An event named "flash" already exists')).toBeInTheDocument()
  })
})

describe('EffectRegistry dialogs', () => {
  it('asks in the window before removing an effect reference', async () => {
    const onEffectsChange = jest.fn()
    withHosts(
      <EffectRegistry
        editorDoc={cueDoc()}
        selectedCueId="cue-1"
        onEffectsChange={onEffectsChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await answer('Delete')

    expect(onEffectsChange).toHaveBeenCalledWith([])
  })
})
