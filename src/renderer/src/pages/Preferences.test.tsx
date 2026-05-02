/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, beforeAll } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import Preferences from './Preferences'

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

describe('Preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders tab list and shows DMX Out content by default', () => {
    render(<Preferences />)

    expect(screen.getByRole('tablist', { name: /preference categories/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'DMX Out' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('prefs-active-rigs')).toBeTruthy()
    expect(screen.getByTestId('prefs-dmx-output')).toBeTruthy()
    expect(screen.getByTestId('prefs-brightness')).toBeTruthy()
  })

  it('switches panels when tabs are activated', () => {
    render(<Preferences />)

    fireEvent.click(screen.getByRole('tab', { name: 'YARG' }))
    expect(screen.getByRole('tab', { name: 'YARG' }).getAttribute('aria-selected')).toBe('true')
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
    expect(screen.getByTestId('prefs-motion-master')).toBeTruthy()
    expect(screen.getByTestId('prefs-cue-consistency')).toBeTruthy()
    expect(screen.getByTestId('prefs-clock-rate')).toBeTruthy()
  })
})
