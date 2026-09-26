/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { EditorDocument } from '../../lib/types'
import type { VariableDefinition } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ConfirmModalHost from '../../../ConfirmModalHost'
import { ToastStack } from '../../../Toast'
import VariableRegistry from './VariableRegistry'

afterEach(() => cleanup())

const groupVar: VariableDefinition = {
  name: 'gvar',
  type: 'number',
  scope: 'cue-group',
  initialValue: 1,
}

const cueDoc = (variables: VariableDefinition[] = [groupVar]): EditorDocument =>
  ({
    mode: 'cue',
    path: '/cues/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'g', name: 'Group', variables },
      cues: [],
    },
  }) as unknown as EditorDocument

function renderRegistry(variables?: VariableDefinition[]) {
  const onVariablesChange = jest.fn()
  renderWithProviders(
    <>
      <VariableRegistry
        editorDoc={cueDoc(variables)}
        selectedCueId={null}
        onVariablesChange={onVariablesChange}
        getVariableReferences={() => []}
      />
      <ToastStack />
      <ConfirmModalHost />
    </>,
  )
  return { onVariablesChange }
}

async function answerPrompt(label: string): Promise<void> {
  const prompt = await screen.findByRole('alertdialog')
  expect(prompt).toHaveTextContent('Delete variable "gvar"?')
  fireEvent.click(within(prompt).getByRole('button', { name: label }))
}

function addGroupVariable(name: string): void {
  fireEvent.click(screen.getAllByRole('button', { name: '+ Add' })[0])
  fireEvent.change(screen.getByPlaceholderText('variableName'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('VariableRegistry', () => {
  it('deletes a variable once the in-app prompt is confirmed', async () => {
    const { onVariablesChange } = renderRegistry()
    fireEvent.click(screen.getByRole('button', { name: 'Del' }))

    await answerPrompt('Delete')

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalledWith([], []))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps the variable when the prompt is cancelled', async () => {
    const { onVariablesChange } = renderRegistry()
    fireEvent.click(screen.getByRole('button', { name: 'Del' }))

    await answerPrompt('Cancel')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onVariablesChange).not.toHaveBeenCalled()
  })

  it('shows a toast and keeps the form open when a new name is taken', async () => {
    const { onVariablesChange } = renderRegistry()
    addGroupVariable('gvar')

    expect(await screen.findByText('A group variable named "gvar" already exists')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onVariablesChange).not.toHaveBeenCalled()
  })

  it('shows a toast when the name is missing', async () => {
    const { onVariablesChange } = renderRegistry()
    addGroupVariable('')

    expect(await screen.findByText('Please fill in all required fields')).toBeTruthy()
    expect(onVariablesChange).not.toHaveBeenCalled()
  })

  it.each(['beat-count', 'my var', '2x'])(
    'refuses the name %s and keeps the form open',
    async (name) => {
      const { onVariablesChange } = renderRegistry()
      addGroupVariable(name)

      expect(
        await screen.findByText(new RegExp(`"${name}" is not a valid variable name`)),
      ).toBeTruthy()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(onVariablesChange).not.toHaveBeenCalled()
    },
  )

  it('adds a variable with a free name', () => {
    const { onVariablesChange } = renderRegistry()
    addGroupVariable('speed')

    expect(onVariablesChange).toHaveBeenCalledWith(
      [groupVar, expect.objectContaining({ name: 'speed', scope: 'cue-group' })],
      [],
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the name being typed when Escape is pressed in the form', () => {
    renderRegistry()
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add' })[0])
    const name = screen.getByPlaceholderText('variableName')
    fireEvent.change(name, { target: { value: 'speed' } })

    fireEvent.keyDown(name, { key: 'Escape' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('variableName')).toHaveValue('speed')
  })

  it('refuses to save an initial value its type cannot hold', async () => {
    const { onVariablesChange } = renderRegistry([
      { name: 'accent', type: 'color', scope: 'cue-group', initialValue: 'mauve' },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/'mauve' is not a known Color/)).toBeTruthy()
    expect(onVariablesChange).not.toHaveBeenCalled()
  })
})
