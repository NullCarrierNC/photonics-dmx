/** @jest-environment jsdom */
/**
 * The import dialog opens on the name the import suggested.
 *
 * Its name field seeds from `defaultName` when the component mounts, so the mount site has to be
 * the thing that is conditional: kept mounted behind an `isOpen` prop, the seed happens once,
 * before there is a pending import to take a name from.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import ImportRigModal from './ImportRigModal'

afterEach(() => cleanup())

const SUMMARY = { templatesToAddCount: 1, templatesReusedCount: 0, orphanCount: 0 }

function open(defaultName: string): void {
  renderWithProviders(
    <ImportRigModal
      isOpen
      sourceBasename="my-rig.json"
      defaultName={defaultName}
      existingRigNamesLower={new Set<string>()}
      summary={SUMMARY}
      onCancel={jest.fn()}
      onSave={jest.fn()}
    />,
  )
}

describe('ImportRigModal', () => {
  it('opens on the suggested name', () => {
    open('My Rig 2')

    expect(screen.getByDisplayValue('My Rig 2')).toBeInTheDocument()
  })

  it('offers Import once it has a name', () => {
    open('My Rig 2')

    expect(screen.getByRole('button', { name: /import/i })).toBeEnabled()
  })

  it('withholds Import when the suggested name is empty', () => {
    open('')

    expect(screen.getByRole('button', { name: /import/i })).toBeDisabled()
  })
})
