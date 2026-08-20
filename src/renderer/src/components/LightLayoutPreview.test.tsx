/** @jest-environment jsdom */
/**
 * The layout schematic draws the front row 1..N left to right and the back row reversed, so the
 * numbering reads as one continuous ring across both rows in every layout.
 */
import { describe, expect, it, afterEach } from '@jest/globals'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigStrobeType } from '../../../photonics-dmx/types'
import LightLayoutPreview from './LightLayoutPreview'

afterEach(() => cleanup())

const renderedNumbers = () => screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent)

describe.each(['two-rows', 'front-back', 'stacked'])('LightLayoutPreview %s layout', (layoutId) => {
  it('renders the back row high-to-low so numbers 1..8 form a continuous ring', () => {
    render(
      <LightLayoutPreview
        layoutId={layoutId}
        frontCount={4}
        backCount={4}
        highlightedLight={null}
        selectedStrobe={ConfigStrobeType.None}
      />,
    )
    expect(renderedNumbers()).toEqual(['1', '2', '3', '4', '8', '7', '6', '5'])
  })
})
