/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { GroupEnableCheckbox } from './GroupEnableCheckbox'

describe('GroupEnableCheckbox', () => {
  it('renders unchecked when checked=false and indeterminate=false', () => {
    render(
      <GroupEnableCheckbox
        checked={false}
        indeterminate={false}
        onChange={jest.fn()}
        ariaLabel="Enable group"
      />,
    )
    const cb = screen.getByRole('checkbox', { name: 'Enable group' }) as HTMLInputElement
    expect(cb.checked).toBe(false)
    expect(cb.indeterminate).toBe(false)
    expect(cb.getAttribute('aria-checked')).toBe('false')
  })

  it('renders checked when checked=true and indeterminate=false', () => {
    render(
      <GroupEnableCheckbox
        checked={true}
        indeterminate={false}
        onChange={jest.fn()}
        ariaLabel="Enable group"
      />,
    )
    const cb = screen.getByRole('checkbox', { name: 'Enable group' }) as HTMLInputElement
    expect(cb.checked).toBe(true)
    expect(cb.indeterminate).toBe(false)
    expect(cb.getAttribute('aria-checked')).toBe('true')
  })

  it('sets aria-checked="mixed" and DOM indeterminate=true when indeterminate=true', () => {
    render(
      <GroupEnableCheckbox
        checked={false}
        indeterminate={true}
        onChange={jest.fn()}
        ariaLabel="Enable group"
      />,
    )
    const cb = screen.getByRole('checkbox', { name: 'Enable group' }) as HTMLInputElement
    expect(cb.indeterminate).toBe(true)
    expect(cb.checked).toBe(false)
    expect(cb.getAttribute('aria-checked')).toBe('mixed')
  })

  it('emits true when an unchecked checkbox is toggled', () => {
    const onChange = jest.fn()
    render(
      <GroupEnableCheckbox
        checked={false}
        indeterminate={false}
        onChange={onChange}
        ariaLabel="Enable group"
      />,
    )
    const cb = screen.getByRole('checkbox', { name: 'Enable group' }) as HTMLInputElement
    fireEvent.click(cb)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('emits false when a checked checkbox is toggled off', () => {
    const onChange = jest.fn()
    render(
      <GroupEnableCheckbox
        checked={true}
        indeterminate={false}
        onChange={onChange}
        ariaLabel="Enable group"
      />,
    )
    const cb = screen.getByRole('checkbox', { name: 'Enable group' }) as HTMLInputElement
    fireEvent.click(cb)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('stops click propagation so a parent expand handler does not also fire', () => {
    const parentClick = jest.fn()
    const onChange = jest.fn()
    render(
      <div onClick={parentClick}>
        <GroupEnableCheckbox
          checked={false}
          indeterminate={false}
          onChange={onChange}
          ariaLabel="Enable group"
        />
      </div>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable group' }))
    expect(onChange).toHaveBeenCalled()
    expect(parentClick).not.toHaveBeenCalled()
  })
})
