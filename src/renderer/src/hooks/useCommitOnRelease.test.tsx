/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useCommitOnRelease } from './useCommitOnRelease'

function Slider({ onCommit }: { onCommit: (value: number) => void }) {
  const [value, setValue] = useState(10)
  const release = useCommitOnRelease((input) => onCommit(Number(input.value)))
  return (
    <input
      aria-label="level"
      type="range"
      min={0}
      max={100}
      value={value}
      onChange={(event) => {
        setValue(Number(event.target.value))
        release.changed()
      }}
      {...release.props}
    />
  )
}

function renderSlider() {
  const onCommit = jest.fn<(value: number) => void>()
  render(<Slider onCommit={onCommit} />)
  return { slider: screen.getByLabelText('level'), onCommit }
}

describe('useCommitOnRelease', () => {
  it('commits the value a drag ended on, once', () => {
    const { slider, onCommit } = renderSlider()

    fireEvent.change(slider, { target: { value: '40' } })
    fireEvent.change(slider, { target: { value: '60' } })
    fireEvent.pointerUp(slider)
    fireEvent.blur(slider)

    expect(onCommit.mock.calls).toEqual([[60]])
  })

  it('commits a keyboard move when the key that moved it comes up', () => {
    const { slider, onCommit } = renderSlider()

    fireEvent.change(slider, { target: { value: '11' } })
    fireEvent.keyUp(slider, { key: 'Shift' })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(onCommit.mock.calls).toEqual([[11]])
  })

  it('commits nothing for a release that moved nothing', () => {
    const { slider, onCommit } = renderSlider()

    fireEvent.pointerUp(slider)
    fireEvent.keyUp(slider, { key: 'Tab' })
    fireEvent.keyUp(slider, { key: 'ArrowLeft' })
    fireEvent.blur(slider)

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits a move the release missed when the slider loses focus', () => {
    const { slider, onCommit } = renderSlider()

    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.blur(slider)

    expect(onCommit.mock.calls).toEqual([[70]])
  })
})
