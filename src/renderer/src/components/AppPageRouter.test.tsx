/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import { Pages } from '../types'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock('../pages/Status', () => ({ __esModule: true, default: () => 'page:Status' }))
jest.mock('../pages/MyLights', () => ({ __esModule: true, default: () => 'page:MyLights' }))
jest.mock('../pages/LightsLayout', () => ({ __esModule: true, default: () => 'page:LightsLayout' }))
jest.mock('../pages/NetworkDebug', () => ({ __esModule: true, default: () => 'page:NetworkDebug' }))
jest.mock('../pages/DmxPreview', () => ({ __esModule: true, default: () => 'page:DmxPreview' }))
jest.mock('../pages/CueSimulation', () => ({
  __esModule: true,
  default: () => 'page:CueSimulation',
}))
jest.mock('../pages/About', () => ({ __esModule: true, default: () => 'page:About' }))
jest.mock('../pages/Preferences', () => ({ __esModule: true, default: () => 'page:Preferences' }))
jest.mock('../pages/DmxConsole', () => ({ __esModule: true, default: () => 'page:DmxConsole' }))

import { AppPageRouter } from './AppPageRouter'

describe('AppPageRouter', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    [Pages.Status, 'page:Status'],
    [Pages.MyLights, 'page:MyLights'],
    [Pages.LightLayout, 'page:LightsLayout'],
    [Pages.DmxConsole, 'page:DmxConsole'],
    [Pages.CuePreview, 'page:DmxPreview'],
    [Pages.CueSimulation, 'page:CueSimulation'],
    [Pages.NetworkDebug, 'page:NetworkDebug'],
    [Pages.Preferences, 'page:Preferences'],
    [Pages.About, 'page:About'],
  ])('renders %s as %s', (page, rendered) => {
    render(<AppPageRouter currentPage={page} />)

    expect(screen.getByText(rendered)).toBeInTheDocument()
  })

  it.each([Pages.CueEditor, Pages.CueSequencer])(
    'offers to open the cue editor window for %s',
    (page) => {
      render(<AppPageRouter currentPage={page} />)

      fireEvent.click(screen.getByRole('button', { name: 'Open Cue Editor' }))

      expect(jest.mocked(ipcApi.openCueEditorWindow)).toHaveBeenCalledTimes(1)
      jest.mocked(ipcApi.openCueEditorWindow).mockClear()
    },
  )

  it('falls back to Status for a page it does not know', () => {
    render(<AppPageRouter currentPage={'Missing' as Pages} />)

    expect(screen.getByText('page:Status')).toBeInTheDocument()
  })
})
