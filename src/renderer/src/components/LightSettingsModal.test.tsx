/** @jest-environment jsdom */
/**
 * The modal shell around the light editor: what opens it, what dismisses it, and which actions it
 * offers. Dismissal is reported rather than acted on, so every route out fires the same callback and
 * the page decides whether it needs confirming.
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FixtureTypes, type DmxFixture } from '../../../photonics-dmx/types'
import LightSettingsModal from './LightSettingsModal'

afterEach(() => cleanup())

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 't1',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'Front PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    ...overrides,
  }
}

const noop = (): void => {}

function renderModal(props: Partial<React.ComponentProps<typeof LightSettingsModal>> = {}) {
  return render(
    <LightSettingsModal
      isOpen
      light={fixture()}
      onChange={noop}
      onSave={noop}
      onCancel={noop}
      {...props}
    />,
  )
}

describe('LightSettingsModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when there is no light to edit', () => {
    renderModal({ light: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('titles by the light being edited', () => {
    renderModal({ onDelete: noop })
    expect(screen.getByText('Edit Front PAR')).toBeTruthy()
  })

  it('titles as an add when the light cannot be deleted yet', () => {
    renderModal({ light: fixture({ id: null }) })
    expect(screen.getByText('Add Light')).toBeTruthy()
  })

  it('reports a cancel from the Cancel button, the backdrop and Escape alike', () => {
    const onCancel = jest.fn()
    renderModal({ onCancel })

    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('does not treat a click inside the panel as a dismissal', () => {
    const onCancel = jest.fn()
    renderModal({ onCancel })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('offers Delete only for a light that has been saved', () => {
    const onDelete = jest.fn()
    renderModal({ onDelete })
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)

    cleanup()
    renderModal({ light: fixture({ id: null }) })
    expect(screen.queryByText('Delete')).toBeNull()
  })

  it('saves from the footer', () => {
    const onSave = jest.fn()
    renderModal({ onSave })
    fireEvent.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('scrolls the panel rather than the page, so a tall fixture stays reachable', () => {
    renderModal()
    expect(screen.getByRole('dialog').className).toContain('overflow-y-auto')
    expect(screen.getByRole('dialog').className).toContain('max-h-[90vh]')
  })
})
