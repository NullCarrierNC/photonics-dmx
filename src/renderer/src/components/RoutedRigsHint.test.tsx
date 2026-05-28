/** @jest-environment jsdom */
/**
 * Tests for RoutedRigsHint: a small label rendered under each wire-sender toggle that lists
 * the active rigs currently routed to that sender. Hidden unless at least one rig has explicit
 * `outputs` set (no point showing it when everything goes everywhere by default).
 */
import { describe, expect, it, afterEach } from '@jest/globals'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { dmxRigsAtom } from '../atoms'
import {
  ConfigStrobeType,
  type DmxRig,
  type LightingConfiguration,
  type WireSenderId,
} from '../../../photonics-dmx/types'
import { RoutedRigsHint } from './RoutedRigsHint'

function emptyConfig(): LightingConfiguration {
  return {
    numLights: 0,
    lightLayout: { id: 'two-rows', label: 'Two Rows' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
  }
}

function makeRig(opts: {
  id: string
  name: string
  outputs?: WireSenderId[]
  active?: boolean
}): DmxRig {
  const rig: DmxRig = {
    id: opts.id,
    name: opts.name,
    active: opts.active ?? true,
    config: emptyConfig(),
  }
  if (opts.outputs !== undefined) {
    rig.outputs = opts.outputs
  }
  return rig
}

function renderHint(rigs: DmxRig[], senderId: WireSenderId, compact = false) {
  const store = createStore()
  store.set(dmxRigsAtom, rigs)
  return render(
    <Provider store={store}>
      <RoutedRigsHint senderId={senderId} compact={compact} />
    </Provider>,
  )
}

afterEach(() => cleanup())

describe('RoutedRigsHint — visibility gate', () => {
  it('renders nothing when no rig has explicit outputs (single-rig default setup)', () => {
    const { container } = renderHint([makeRig({ id: 'r1', name: 'Living Room' })], 'sacn')
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when every rig has outputs: undefined (multi-rig, no routing yet)', () => {
    const { container } = renderHint(
      [makeRig({ id: 'r1', name: 'Living Room' }), makeRig({ id: 'r2', name: 'Garage' })],
      'sacn',
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null in compact mode regardless of routing state', () => {
    const { container } = renderHint(
      [makeRig({ id: 'r1', name: 'Living Room', outputs: ['sacn'] })],
      'sacn',
      true,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('RoutedRigsHint — per-sender display once routing is defined', () => {
  it('shows only the rigs routed to the target sender', () => {
    const rigs = [
      makeRig({ id: 'a', name: 'Living Room', outputs: ['sacn'] }),
      makeRig({ id: 'b', name: 'Garage', outputs: ['opendmx'] }),
    ]
    renderHint(rigs, 'sacn')
    expect(screen.queryByText('Living Room')).toBeTruthy()
    expect(screen.queryByText('Garage')).toBeNull()
  })

  it('includes a rig with outputs: undefined under every sender alongside explicitly-routed siblings', () => {
    // Once any rig has explicit outputs, the hint is shown. A sibling rig with undefined
    // outputs publishes everywhere — it must show up under each sender.
    const rigs = [
      makeRig({ id: 'a', name: 'Living Room' }), // undefined → all senders
      makeRig({ id: 'b', name: 'Garage', outputs: ['opendmx'] }),
    ]
    renderHint(rigs, 'sacn')
    expect(screen.queryByText('Living Room')).toBeTruthy()
    expect(screen.queryByText('Garage')).toBeNull()

    cleanup()
    renderHint(rigs, 'opendmx')
    // Both should appear under opendmx.
    expect(screen.queryByText(/Living Room/)).toBeTruthy()
    expect(screen.queryByText(/Garage/)).toBeTruthy()
  })

  it('excludes inactive rigs even when their outputs target the sender', () => {
    const rigs = [
      makeRig({ id: 'a', name: 'Living Room', outputs: ['sacn'], active: false }),
      makeRig({ id: 'b', name: 'Garage', outputs: ['sacn'] }),
    ]
    renderHint(rigs, 'sacn')
    expect(screen.queryByText('Garage')).toBeTruthy()
    expect(screen.queryByText(/Living Room/)).toBeNull()
  })

  it('shows the empty-routed placeholder when no active rig targets the sender', () => {
    const rigs = [
      makeRig({ id: 'a', name: 'Living Room', outputs: ['opendmx'] }),
      makeRig({ id: 'b', name: 'Garage', outputs: ['opendmx'] }),
    ]
    renderHint(rigs, 'sacn')
    expect(screen.queryByText(/No active rig routed/i)).toBeTruthy()
  })

  it('rig with outputs: [] is treated as routed nowhere on the wire', () => {
    const rigs = [
      makeRig({ id: 'a', name: 'Living Room', outputs: [] }),
      makeRig({ id: 'b', name: 'Garage', outputs: ['sacn'] }),
    ]
    renderHint(rigs, 'sacn')
    expect(screen.queryByText('Garage')).toBeTruthy()
    expect(screen.queryByText(/Living Room/)).toBeNull()
  })
})
