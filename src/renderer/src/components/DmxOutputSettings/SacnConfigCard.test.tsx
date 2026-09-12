/** @jest-environment jsdom */
/**
 * The universe field commits what the user finished typing, held to the universes sACN defines.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { SacnConfigCard, type SacnConfig } from './SacnConfigCard'

const config: SacnConfig = { universe: 5, refreshRateHz: 40 }

function renderCard(): { onConfigChange: jest.Mock; universe: HTMLElement } {
  const onConfigChange = jest.fn()
  render(
    <SacnConfigCard
      config={config}
      networkInterfaces={[]}
      expanded={true}
      onToggle={jest.fn()}
      onConfigChange={onConfigChange as SacnConfigCardChange}
    />,
  )
  return { onConfigChange, universe: screen.getByLabelText('Universe') }
}

type SacnConfigCardChange = (field: keyof SacnConfig, value: string | number | boolean) => void

describe('SacnConfigCard universe field', () => {
  it('commits the lowest universe sACN defines when a lower one is typed', () => {
    const { onConfigChange, universe } = renderCard()

    fireEvent.change(universe, { target: { value: '0' } })
    fireEvent.blur(universe)

    expect(onConfigChange).toHaveBeenCalledWith('universe', 1)
  })

  it('commits a universe inside the range as typed', () => {
    const { onConfigChange, universe } = renderCard()

    fireEvent.change(universe, { target: { value: '12' } })
    fireEvent.blur(universe)

    expect(onConfigChange).toHaveBeenCalledWith('universe', 12)
  })
})
