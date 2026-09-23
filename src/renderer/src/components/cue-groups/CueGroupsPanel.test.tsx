/** @jest-environment jsdom */
/**
 * The enable panel every cue domain shares, run against a fake domain. Each domain's own suite
 * covers its IPC wiring, its wording and the save-failure paths.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  CueGroupsPanel,
  type CueGroupRowData,
  type CueGroupsDomain,
  type CueRowData,
} from './CueGroupsPanel'

type Domain = CueGroupsDomain<CueGroupRowData, CueRowData>

interface Seed {
  groups?: CueGroupRowData[]
  enabled?: string[]
  disabled?: Record<string, string[]>
  /** Cue ids per group, in the order the domain answers them. */
  cues?: Record<string, string[]>
}

const DEFAULT_GROUPS: CueGroupRowData[] = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'beta', name: 'Beta' },
]

function fakeDomain(seed: Seed = {}) {
  const groups = seed.groups ?? DEFAULT_GROUPS
  const cues = seed.cues ?? {}
  return {
    key: 'test',
    title: 'Test Cue Groups',
    description: 'Choose which groups can play.',
    label: 'Test',
    getGroups: jest.fn<Domain['getGroups']>(async () => groups),
    getEnabled: jest.fn<Domain['getEnabled']>(async () => seed.enabled ?? []),
    getDisabled: jest.fn<Domain['getDisabled']>(async () => seed.disabled ?? {}),
    setEnabled: jest.fn<Domain['setEnabled']>(async () => ({ success: true })),
    setDisabled: jest.fn<Domain['setDisabled']>(async () => ({ success: true })),
    getCues: jest.fn<Domain['getCues']>(async (groupId) =>
      (cues[groupId] ?? []).map((id) => ({ id })),
    ),
    renderCueLabel: (cue: CueRowData) => `Cue ${cue.id}`,
    emptyLabel: 'No cues in this group',
    cuesHeading: (count: number) => `${count} cues`,
  } satisfies Domain
}

function renderPanel(domain: Domain) {
  return renderWithProviders(<CueGroupsPanel domain={domain} />)
}

/** Resolves once the groups have loaded. */
function groupCheckboxes(): Promise<HTMLElement[]> {
  return screen.findAllByRole('checkbox', { name: /^Enable / })
}

function groupCheckbox(name: string): HTMLElement {
  return screen.getByRole('checkbox', { name: `Enable ${name}` })
}

function expandButton(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

afterEach(() => cleanup())

describe('CueGroupsPanel', () => {
  it('lists groups by name, ignoring case', async () => {
    renderPanel(
      fakeDomain({
        groups: [
          { id: 'c', name: 'charlie' },
          { id: 'b', name: 'Beta' },
          { id: 'a', name: 'alpha' },
        ],
      }),
    )
    const boxes = await groupCheckboxes()
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual([
      'Enable alpha',
      'Enable Beta',
      'Enable charlie',
    ])
  })

  it('shows a failed load and reads everything again on Retry', async () => {
    const domain = fakeDomain()
    domain.getGroups.mockRejectedValue(new Error('load boom'))
    renderPanel(domain)
    expect((await screen.findByRole('alert')).textContent).toContain('load boom')

    domain.getGroups.mockResolvedValue(DEFAULT_GROUPS)
    const reads = [domain.getGroups, domain.getEnabled, domain.getDisabled].map(
      (read) => read.mock.calls.length,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await groupCheckboxes()
    expect(domain.getGroups).toHaveBeenCalledTimes(reads[0]! + 1)
    expect(domain.getEnabled).toHaveBeenCalledTimes(reads[1]! + 1)
    expect(domain.getDisabled).toHaveBeenCalledTimes(reads[2]! + 1)
  })

  it('enables a group and clears its disabled cues when it is turned on', async () => {
    const domain = fakeDomain({ enabled: ['alpha'], disabled: { beta: ['b1'] } })
    renderPanel(domain)
    await groupCheckboxes()

    fireEvent.click(groupCheckbox('Beta'))
    await waitFor(() => expect(groupCheckbox('Beta')).toBeChecked())
    expect(domain.setEnabled).toHaveBeenCalledWith(['alpha', 'beta'])
    expect(domain.setDisabled).toHaveBeenCalledWith({})
  })

  it('keeps both groups when a second is ticked before the first one saves', async () => {
    const domain = fakeDomain()
    let releaseFirst: (() => void) | undefined
    domain.setEnabled.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return { success: true }
    })
    renderPanel(domain)
    await groupCheckboxes()

    fireEvent.click(groupCheckbox('Alpha'))
    fireEvent.click(groupCheckbox('Beta'))
    await waitFor(() => expect(releaseFirst).toBeDefined())
    await act(async () => releaseFirst?.())

    await waitFor(() => expect(groupCheckbox('Beta')).toBeChecked())
    expect(groupCheckbox('Alpha')).toBeChecked()
    expect(domain.setEnabled).toHaveBeenLastCalledWith(['alpha', 'beta'])
  })

  it('keeps the disabled cues of a group that is turned off', async () => {
    const domain = fakeDomain({ enabled: ['alpha', 'beta'], disabled: { alpha: ['a1'] } })
    renderPanel(domain)
    await groupCheckboxes()

    fireEvent.click(groupCheckbox('Alpha'))
    await waitFor(() => expect(groupCheckbox('Alpha')).not.toBeChecked())
    expect(domain.setEnabled).toHaveBeenCalledWith(['beta'])
    expect(domain.setDisabled).toHaveBeenCalledWith({ alpha: ['a1'] })
  })

  it('shows each group as on, mixed or off from its disabled cues', async () => {
    const domain = fakeDomain({
      groups: [
        { id: 'alpha', name: 'Alpha' },
        { id: 'beta', name: 'Beta' },
        { id: 'charlie', name: 'Charlie' },
      ],
      enabled: ['alpha', 'beta', 'charlie'],
      disabled: { beta: ['b1'], charlie: ['c1', 'c2'] },
      cues: { alpha: ['a1', 'a2'], beta: ['b1', 'b2'], charlie: ['c1', 'c2'] },
    })
    renderPanel(domain)
    await groupCheckboxes()

    for (const name of ['Alpha', 'Beta', 'Charlie']) fireEvent.click(expandButton(name))
    for (const cue of ['Cue a1', 'Cue b1', 'Cue c1']) {
      await screen.findByRole('checkbox', { name: cue })
    }

    expect(groupCheckbox('Alpha')).toHaveAttribute('aria-checked', 'true')
    expect(groupCheckbox('Beta')).toHaveAttribute('aria-checked', 'mixed')
    expect(groupCheckbox('Charlie')).toHaveAttribute('aria-checked', 'false')
  })

  it('drops a group once its last cue is unticked and restores it when one is ticked', async () => {
    const domain = fakeDomain({
      enabled: ['alpha'],
      disabled: { alpha: ['a1'] },
      cues: { alpha: ['a1', 'a2'] },
    })
    renderPanel(domain)
    await groupCheckboxes()
    fireEvent.click(expandButton('Alpha'))

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cue a2' }))
    await waitFor(() => expect(groupCheckbox('Alpha')).toHaveAttribute('aria-checked', 'false'))
    expect(domain.setEnabled).toHaveBeenLastCalledWith([])
    expect(domain.setDisabled).toHaveBeenLastCalledWith({ alpha: ['a1', 'a2'] })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Cue a1' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Cue a1' })).toBeChecked())
    expect(domain.setEnabled).toHaveBeenLastCalledWith(['alpha'])
    expect(domain.setDisabled).toHaveBeenLastCalledWith({ alpha: ['a2'] })
  })

  it('fetches cues on the first open only and lists them by id under the heading', async () => {
    const domain = fakeDomain({ enabled: ['alpha'], cues: { alpha: ['a2', 'a1'] } })
    renderPanel(domain)
    await groupCheckboxes()

    fireEvent.click(expandButton('Alpha'))
    expect(await screen.findByText('2 cues')).toBeInTheDocument()
    expect(screen.getAllByText(/^Cue a/).map((label) => label.textContent)).toEqual([
      'Cue a1',
      'Cue a2',
    ])

    fireEvent.click(expandButton('Alpha'))
    await waitFor(() => expect(screen.queryByText('2 cues')).toBeNull())
    fireEvent.click(expandButton('Alpha'))
    expect(await screen.findByText('2 cues')).toBeInTheDocument()
    expect(domain.getCues).toHaveBeenCalledTimes(1)
  })

  it('shows the empty label for a group with no cues', async () => {
    renderPanel(fakeDomain())
    await groupCheckboxes()
    fireEvent.click(expandButton('Alpha'))
    expect(await screen.findByText('No cues in this group')).toBeInTheDocument()
  })

  it.each([
    ['enabled groups', 'setEnabled', 'Failed to save enabled cue groups'],
    ['disabled cues', 'setDisabled', 'Failed to save disabled Test cues'],
  ] as const)(
    'falls back to generic copy when saving the %s fails without a message',
    async (_what, method, message) => {
      const domain = fakeDomain({ enabled: ['alpha'] })
      domain[method].mockResolvedValueOnce({ success: false })
      renderPanel(domain)
      await groupCheckboxes()

      fireEvent.click(groupCheckbox('Beta'))
      expect((await screen.findByRole('alert')).textContent).toContain(message)
    },
  )

  it('retries a failed group toggle from its row', async () => {
    const domain = fakeDomain({ enabled: ['alpha'] })
    domain.setEnabled.mockResolvedValueOnce({ success: false, error: 'save refused' })
    renderPanel(domain)
    await groupCheckboxes()

    fireEvent.click(groupCheckbox('Beta'))
    expect((await screen.findByRole('alert')).textContent).toContain('save refused')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(domain.setEnabled).toHaveBeenCalledTimes(2)
    expect(domain.setEnabled).toHaveBeenLastCalledWith(['alpha', 'beta'])
  })
})
