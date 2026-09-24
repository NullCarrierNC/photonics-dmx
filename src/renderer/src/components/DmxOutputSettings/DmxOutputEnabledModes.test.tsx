/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import DmxOutputEnabledModes from './DmxOutputEnabledModes'

describe('DmxOutputEnabledModes', () => {
  it('says that ticking a mode starts that output and unticking stops it', () => {
    render(
      <DmxOutputEnabledModes
        saving={new Set()}
        sacnEnabled
        onSacnToggle={jest.fn()}
        artNetEnabled={false}
        onArtNetToggle={jest.fn()}
        enttecProEnabled={false}
        onEnttecProToggle={jest.fn()}
        openDmxEnabled={false}
        onOpenDmxToggle={jest.fn()}
      />,
    )

    expect(screen.getByText(/Ticking one starts that output straight away/)).toBeTruthy()
    expect(screen.getByText(/unticking one stops it/)).toBeTruthy()
  })
})
