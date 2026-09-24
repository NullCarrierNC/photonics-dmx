/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, beforeAll } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import Preferences from './Preferences'
import { lightingPrefsAtom } from '../atoms'
import { emitWindowApi, installWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

beforeAll(() => {
  installWindowApi()
})

jest.mock('../components/ActiveRigsSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-active-rigs" />,
}))
jest.mock('../components/DmxOutputSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-dmx-output" />,
}))
jest.mock('../components/BrightnessSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-brightness" />,
}))
jest.mock('../components/WhiteChannelMixModeSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-white-mix-mode" />,
}))
jest.mock('../components/YargEnabledCueGroups', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-yarg-cues" />,
}))
jest.mock('../components/MotionEnabledCueGroups', () => ({
  __esModule: true,
  default: ({ platform }: { platform: string }) => <div data-testid={`prefs-motion-${platform}`} />,
}))
jest.mock('../components/StageKitYargPrioritySettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-stagekit-yarg" />,
}))
jest.mock('../components/StageKitRb3EnhancedSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-stagekit-rb3" />,
}))
jest.mock('../components/AudioPreferencesTabContent', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-audio-inner" />,
}))
jest.mock('../components/AudioEnabledCueGroups', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-audio-cues" />,
}))
jest.mock('../components/CueConsistencySettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-cue-consistency" />,
}))
jest.mock('../components/ClockRateSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-clock-rate" />,
}))
jest.mock('../components/BlackoutShortcutSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-esc-blackout" />,
}))
jest.mock('../components/AdvancedModeSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-advanced-mode" />,
}))
jest.mock('../components/LagCompensationSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-lag-compensation" />,
}))

const motionMaster = () => screen.queryByRole('checkbox', { name: /Enable motion support/ })

describe('Preferences', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(true)
  })

  it('with Advanced Mode off hides Audio tab, Active Rigs, and only Advanced toggle on Advanced tab', () => {
    renderWithProviders(<Preferences />)

    expect(screen.getByRole('tablist', { name: /preference categories/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'DMX Out' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('tab', { name: 'Audio' })).toBeNull()
    expect(screen.queryByTestId('prefs-active-rigs')).toBeNull()
    expect(screen.getByTestId('prefs-dmx-output')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-brightness')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-white-mix-mode')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    expect(screen.getByTestId('prefs-advanced-mode')).toBeInTheDocument()
    expect(motionMaster()).toBeNull()
    expect(screen.queryByTestId('prefs-cue-consistency')).toBeNull()
    expect(screen.queryByTestId('prefs-clock-rate')).toBeNull()
    // The blackout shortcut is not an advanced setting: it stays reachable either way.
    expect(screen.getByTestId('prefs-esc-blackout')).toBeInTheDocument()
    // Lag compensation is the same: a rig out of step with the screen is not an advanced problem.
    expect(screen.getByTestId('prefs-lag-compensation')).toBeInTheDocument()
  })

  it('with Advanced Mode on shows Audio tab, Active Rigs, and full Advanced tab content', () => {
    renderWithProviders(<Preferences />, {
      seed: (set) => set(lightingPrefsAtom, { advancedModeEnabled: true }),
    })

    expect(screen.getByRole('tab', { name: 'Audio' })).toBeInTheDocument()
    expect(screen.getByTestId('prefs-active-rigs')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'YARG' }))
    expect(screen.getByTestId('prefs-yarg-cues')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-motion-yarg')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-stagekit-yarg')).toBeInTheDocument()
    expect(motionMaster()).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'RB3' }))
    expect(screen.getByTestId('prefs-stagekit-rb3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }))
    expect(screen.getByTestId('prefs-audio-inner')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-audio-cues')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-motion-audio')).toBeInTheDocument()
    expect(motionMaster()).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    expect(screen.getByTestId('prefs-advanced-mode')).toBeInTheDocument()
    expect(motionMaster()).toBeInTheDocument()
    expect(screen.getByTestId('prefs-cue-consistency')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-clock-rate')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-esc-blackout')).toBeInTheDocument()
    expect(screen.getByTestId('prefs-lag-compensation')).toBeInTheDocument()
  })

  it('puts lag compensation above the Advanced Mode toggle', () => {
    renderWithProviders(<Preferences />)
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))

    const lag = screen.getByTestId('prefs-lag-compensation')
    const advancedMode = screen.getByTestId('prefs-advanced-mode')

    expect(lag.compareDocumentPosition(advancedMode)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('reads the motion master state once, however often the Advanced tab opens', async () => {
    renderWithProviders(<Preferences />, {
      seed: (set) => set(lightingPrefsAtom, { advancedModeEnabled: true }),
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('tab', { name: 'YARG' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await act(async () => {})

    expect(jest.mocked(ipcApi.getMotionEnabled)).toHaveBeenCalledTimes(1)
  })

  it('shows the motion master state main reports, and follows its announcements', async () => {
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(false)
    renderWithProviders(<Preferences />, {
      seed: (set) => set(lightingPrefsAtom, { advancedModeEnabled: true }),
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))

    await waitFor(() => expect(motionMaster()).not.toBeChecked())

    act(() => emitWindowApi(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, true))

    expect(motionMaster()).toBeChecked()
  })

  it('turns motion off once main stores it', async () => {
    renderWithProviders(<Preferences />, {
      seed: (set) => set(lightingPrefsAtom, { advancedModeEnabled: true }),
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await waitFor(() => expect(motionMaster()).toBeChecked())

    fireEvent.click(motionMaster()!)

    await waitFor(() => expect(motionMaster()).not.toBeChecked())
    expect(jest.mocked(ipcApi.setMotionEnabled)).toHaveBeenCalledWith(false)
  })

  it('moves between tabs with the arrow keys, Home and End', () => {
    renderWithProviders(<Preferences />)
    const tab = (name: string) => screen.getByRole('tab', { name })

    fireEvent.keyDown(tab('DMX Out'), { key: 'ArrowRight' })
    expect(tab('YARG').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('YARG'))

    fireEvent.keyDown(tab('YARG'), { key: 'End' })
    expect(document.activeElement).toBe(tab('Advanced'))

    fireEvent.keyDown(tab('Advanced'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab('DMX Out'))

    fireEvent.keyDown(tab('DMX Out'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tab('Advanced'))

    fireEvent.keyDown(tab('Advanced'), { key: 'Home' })
    expect(tab('DMX Out').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('DMX Out'))
  })
})
