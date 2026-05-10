/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, beforeAll } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import Preferences from './Preferences'
import { lightingPrefsAtom } from '../atoms'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getMotionEnabled: jest.fn(() => Promise.resolve(true)),
  }
})

beforeAll(() => {
  Object.defineProperty(window, 'api', {
    value: {
      receive: jest.fn().mockReturnValue(jest.fn()),
      invoke: jest.fn(),
    },
    configurable: true,
  })
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
jest.mock('../components/YargEnabledCueGroups', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-yarg-cues" />,
}))
jest.mock('../components/MotionMasterToggle', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-motion-master" />,
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
jest.mock('../components/AdvancedModeSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="prefs-advanced-mode" />,
}))

describe('Preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('with Advanced Mode off hides Audio tab, Active Rigs, and only Advanced toggle on Advanced tab', () => {
    render(<Preferences />)

    expect(screen.getByRole('tablist', { name: /preference categories/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'DMX Out' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('tab', { name: 'Audio' })).toBeNull()
    expect(screen.queryByTestId('prefs-active-rigs')).toBeNull()
    expect(screen.getByTestId('prefs-dmx-output')).toBeTruthy()
    expect(screen.getByTestId('prefs-brightness')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    expect(screen.getByTestId('prefs-advanced-mode')).toBeTruthy()
    expect(screen.queryByTestId('prefs-motion-master')).toBeNull()
    expect(screen.queryByTestId('prefs-cue-consistency')).toBeNull()
    expect(screen.queryByTestId('prefs-clock-rate')).toBeNull()
  })

  it('with Advanced Mode on shows Audio tab, Active Rigs, and full Advanced tab content', () => {
    const store = createStore()
    store.set(lightingPrefsAtom, { advancedModeEnabled: true })

    render(
      <Provider store={store}>
        <Preferences />
      </Provider>,
    )

    expect(screen.getByRole('tab', { name: 'Audio' })).toBeTruthy()
    expect(screen.getByTestId('prefs-active-rigs')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'YARG' }))
    expect(screen.getByTestId('prefs-yarg-cues')).toBeTruthy()
    expect(screen.getByTestId('prefs-motion-yarg')).toBeTruthy()
    expect(screen.getByTestId('prefs-stagekit-yarg')).toBeTruthy()
    expect(screen.queryByTestId('prefs-motion-master')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'RB3' }))
    expect(screen.getByTestId('prefs-stagekit-rb3')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }))
    expect(screen.getByTestId('prefs-audio-inner')).toBeTruthy()
    expect(screen.getByTestId('prefs-audio-cues')).toBeTruthy()
    expect(screen.getByTestId('prefs-motion-audio')).toBeTruthy()
    expect(screen.queryByTestId('prefs-motion-master')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    expect(screen.getByTestId('prefs-advanced-mode')).toBeTruthy()
    expect(screen.getByTestId('prefs-motion-master')).toBeTruthy()
    expect(screen.getByTestId('prefs-cue-consistency')).toBeTruthy()
    expect(screen.getByTestId('prefs-clock-rate')).toBeTruthy()
  })
})
