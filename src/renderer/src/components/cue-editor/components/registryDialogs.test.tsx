/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { EditorDocument } from '../lib/types'
import { createDefaultEffectFile, createDefaultFile } from '../lib/cueDefaults'
import * as ipcApi from '../../../ipcApi'
import type { EffectFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
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

  it('keeps the event being typed when Escape is pressed in the form', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    const name = screen.getByPlaceholderText('eventName')
    fireEvent.change(name, { target: { value: 'myEvent' } })

    fireEvent.keyDown(name, { key: 'Escape' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('eventName')).toHaveValue('myEvent')
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

  it('shows no effects from a file read that finished after the dialog closed', async () => {
    const effects = createDefaultEffectFile('yarg')
    effects.effects[0]!.name = 'Late Sweep'
    jest.mocked(ipcApi.listEffectFiles).mockResolvedValue({
      yarg: [
        {
          path: '/effects/fx.json',
          groupId: 'fx',
          groupName: 'Sweeps',
          effectCount: 1,
          mode: 'yarg',
          updatedAt: 0,
        },
      ],
      audio: [],
    })
    let finishRead: (file: EffectFile) => void = () => undefined
    jest.mocked(ipcApi.readEffectFile).mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve
      }),
    )
    withHosts(
      <EffectRegistry editorDoc={cueDoc()} selectedCueId="cue-1" onEffectsChange={jest.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Import Effect' }))
    const fileBox = await screen.findByRole('combobox', { name: /Select Effect File/ })
    await screen.findByRole('option', { name: /Sweeps/ })
    fireEvent.change(fileBox, { target: { value: '/effects/fx.json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => finishRead(effects))
    fireEvent.click(screen.getByRole('button', { name: '+ Import Effect' }))
    await screen.findByRole('option', { name: /Sweeps/ })

    expect(screen.queryByRole('option', { name: /Late Sweep/ })).toBeNull()
  })
})
