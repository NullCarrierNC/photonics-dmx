/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import NewFileModal from './NewFileModal'
import ImportCueFileModal from './ImportCueFileModal'

afterEach(() => {
  jest.restoreAllMocks()
})

function renderNewFile(existing: string[] = [], existingFiles: string[] = []) {
  const onSave = jest.fn()
  renderWithProviders(
    <NewFileModal
      isOpen
      isEffectMode={false}
      mode="yarg"
      existingGroupIds={new Set(existing)}
      existingFilenamesLower={new Set(existingFiles)}
      onCancel={jest.fn()}
      onSave={onSave}
    />,
  )
  return onSave
}

function renderImport(existingGroups: string[] = [], existingFiles: string[] = []) {
  const onSave = jest.fn()
  renderWithProviders(
    <ImportCueFileModal
      isOpen
      isEffectMode={false}
      mode="yarg"
      sourceBasename="shared-cues"
      defaultGroupId="shared-cues-2"
      existingGroupIds={new Set(existingGroups)}
      existingFilenamesLower={new Set(existingFiles)}
      onCancel={jest.fn()}
      onSave={onSave}
    />,
  )
  return onSave
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })

describe('NewFileModal', () => {
  it('saves the group and first cue once the required fields are filled', () => {
    const onSave = renderNewFile()

    type('Cue Group ID', 'my-cues')
    type('Cue Group Name', 'My Cues')
    type('First Cue Name', 'Opener')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'my-cues', groupName: 'My Cues', itemName: 'Opener' }),
    )
  })

  it('says a group ID is taken and holds Save', () => {
    renderNewFile(['my-cues'])

    type('Cue Group ID', 'My-Cues')

    expect(screen.getByText(/already used by another cue file/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('says the file a group ID names exists and holds Save', () => {
    renderNewFile(['friday-show'], ['show.json'])

    type('Cue Group ID', 'Show')
    type('Cue Group Name', 'Scratch')
    type('First Cue Name', 'Opener')

    expect(screen.getByText(/named Show\.json already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it.each([
    ['Cmd+Enter', { metaKey: true }],
    ['Ctrl+Enter', { ctrlKey: true }],
  ])('saves a complete form on %s', (_shortcut, modifier) => {
    const onSave = renderNewFile()

    type('Cue Group ID', 'my-cues')
    type('Cue Group Name', 'My Cues')
    type('First Cue Name', 'Opener')
    fireEvent.keyDown(screen.getByLabelText('First Cue Name', { exact: false }), {
      key: 'Enter',
      ...modifier,
    })

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('saves nothing and raises no alert when Cmd+Enter lands on an incomplete form', () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => undefined)
    const onSave = renderNewFile()

    type('Cue Group ID', 'my-cues')
    fireEvent.keyDown(screen.getByLabelText('Cue Group ID', { exact: false }), {
      key: 'Enter',
      metaKey: true,
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
  })
})

describe('ImportCueFileModal', () => {
  it('imports under the chosen filename and group ID', () => {
    const onSave = renderImport()

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(onSave).toHaveBeenCalledWith('shared-cues.json', 'shared-cues-2')
  })

  it('holds Import while the filename is taken', () => {
    renderImport([], ['shared-cues.json'])

    expect(screen.getByText(/file with this name already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })

  it('holds Import while the group ID is taken', () => {
    renderImport(['shared-cues-2'])

    expect(screen.getByLabelText('Cue group ID', { exact: false })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })
})
