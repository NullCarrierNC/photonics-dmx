/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { MotorEdgeHomeWarnings } from './MotorEdgeHomeWarnings'

describe('MotorEdgeHomeWarnings', () => {
  it('shows pan-edge copy when panHome is at 100%', () => {
    render(<MotorEdgeHomeWarnings panHome={100} tiltHome={50} />)
    expect(screen.getByTestId('mh-cal-edge-home-warning')).toBeTruthy()
    expect(screen.getByText(/Home is set near the pan motor/i)).toBeTruthy()
    expect(screen.queryByText(/Home is set near the tilt motor/i)).toBeNull()
  })

  it('shows nothing when panHome is mid-range', () => {
    render(<MotorEdgeHomeWarnings panHome={50} tiltHome={50} />)
    expect(screen.queryByTestId('mh-cal-edge-home-warning')).toBeNull()
  })
})
