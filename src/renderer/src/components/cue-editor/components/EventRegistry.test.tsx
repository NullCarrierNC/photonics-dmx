/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import Ajv from 'ajv'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { EditorDocument } from '../lib/types'
import { eventDefinitionSchema } from '../../../../../photonics-dmx/cues/node/schema/primitives'
import { CueType } from '../../../../../photonics-dmx/cues/types/cueTypes'
import { ToastStack } from '../../Toast'
import EventRegistry from './EventRegistry'

afterEach(() => cleanup())

const cueDoc: EditorDocument = {
  mode: 'cue',
  path: '/cues/file.json',
  file: {
    version: 1,
    mode: 'yarg',
    group: { id: 'g', name: 'Group' },
    cues: [
      {
        id: 'c1',
        name: 'Cue',
        kind: 'lighting',
        cueType: CueType.Default,
        style: 'primary',
        nodes: { events: [], actions: [] },
        connections: [],
        events: [],
      },
    ],
  },
}

const schemaAccepts = new Ajv().compile(eventDefinitionSchema)

function renderRegistry() {
  const onEventsChange = jest.fn()
  renderWithProviders(
    <>
      <EventRegistry
        editorDoc={cueDoc}
        selectedCueId="c1"
        onEventsChange={onEventsChange}
        getEventReferences={() => []}
      />
      <ToastStack />
    </>,
  )
  return { onEventsChange }
}

function typeEventName(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
  const input = screen.getByPlaceholderText('eventName')
  fireEvent.change(input, { target: { value: name } })
  return input
}

describe('EventRegistry', () => {
  it.each(['my-event', 'my event', '2x'])(
    'refuses the name %s and keeps the form open',
    async (name) => {
      const { onEventsChange } = renderRegistry()
      typeEventName(name)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(
        await screen.findByText(new RegExp(`^"${name}" is not a valid event name.*\\.$`)),
      ).toBeTruthy()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(onEventsChange).not.toHaveBeenCalled()
    },
  )

  it('adds an event with a valid name', () => {
    const { onEventsChange } = renderRegistry()
    typeEventName('kick_hit')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onEventsChange).toHaveBeenCalledWith([{ name: 'kick_hit', description: '' }])
  })

  it.each(['kick_hit', '_drop', 'Chorus2', 'my-event', 'my event', '2x', 'tëst'])(
    'flags the name %s exactly when the schema refuses it',
    (name) => {
      renderRegistry()
      const input = typeEventName(name)

      expect(input.getAttribute('aria-invalid') === 'true').toBe(!schemaAccepts({ name }))
    },
  )
})
