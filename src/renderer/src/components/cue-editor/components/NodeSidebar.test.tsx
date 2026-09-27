/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { useEffect, useState } from 'react'
import type { Edge } from 'reactflow'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type {
  AudioEventNode,
  AudioTriggerNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useNodeSelection } from '../hooks/useNodeSelection'
import type { EditorNode } from '../lib/types'
import { AUDIO_TRIGGER_DEFAULTS } from './node-editors/AudioTriggerEditor'
import NodeSidebar from './NodeSidebar'

jest.mock(
  '../../../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

const cueCalled = (id: string, cooldownMs: number): EditorNode => {
  const payload: AudioEventNode = {
    id,
    type: 'event',
    eventType: 'cue-called',
    triggerMode: 'edge',
    cooldownMs,
  }
  return { id, position: { x: 0, y: 0 }, data: { kind: 'event', label: id, payload } }
}

const audioTrigger = (id: string, holdMs: number): EditorNode => {
  const payload = { ...AUDIO_TRIGGER_DEFAULTS, id, type: 'event', holdMs } as AudioTriggerNode
  return { id, position: { x: 0, y: 0 }, data: { kind: 'event', label: id, payload } }
}

let latestNodes: EditorNode[] = []
let select: (id: string | null) => void = () => {}

function Editor({ initial }: { initial: EditorNode[] }) {
  const [nodes, setNodes] = useState(initial)
  const [edges, setEdges] = useState<Edge[]>([])
  const selection = useNodeSelection({
    nodes,
    setNodes,
    edges,
    setEdges,
    reactFlowInstance: null,
    activeMode: 'audio',
    setIsDirty: () => {},
  })
  useEffect(() => {
    latestNodes = nodes
    select = selection.setSelectedNodeId
  })
  const noop = (): void => {}
  return (
    <NodeSidebar
      activeMode="audio"
      cueKind="lighting"
      editorMode="cue"
      selectedNode={selection.selectedNode}
      selectedActionHasEventParent={false}
      availableVariables={[]}
      addEventNode={noop}
      addActionNode={noop}
      addLogicNode={noop}
      updateSelectedNode={selection.updateSelectedNode}
    />
  )
}

const payloadOf = <T,>(id: string): T =>
  latestNodes.find((node) => node.id === id)!.data.payload as T

/** Types into a field that keeps focus, as it does while the selection moves by keyboard. */
function typeInto(label: string, value: string): void {
  const field = screen.getByLabelText(label)
  act(() => field.focus())
  fireEvent.change(field, { target: { value } })
}

describe('the node sidebar when the selection moves while a field holds typed text', () => {
  it('writes the typed cooldown to the node it was typed for and shows the next node', () => {
    renderWithProviders(<Editor initial={[cueCalled('A', 0), cueCalled('B', 1000)]} />)
    act(() => select('A'))

    typeInto('Cooldown (ms)', '250')
    act(() => select('B'))

    expect(screen.getByLabelText('Cooldown (ms)')).toHaveValue(1000)
    expect(payloadOf<AudioEventNode>('A').cooldownMs).toBe(250)
    expect(payloadOf<AudioEventNode>('B').cooldownMs).toBe(1000)
  })

  it('writes a typed hold time to the trigger it was typed for', () => {
    renderWithProviders(<Editor initial={[audioTrigger('A', 0), audioTrigger('B', 400)]} />)
    act(() => select('A'))

    typeInto('Hold time (ms)', '120')
    act(() => select('B'))

    expect(screen.getByLabelText('Hold time (ms)')).toHaveValue(400)
    expect(payloadOf<AudioTriggerNode>('A').holdMs).toBe(120)
    expect(payloadOf<AudioTriggerNode>('B').holdMs).toBe(400)
  })

  it('writes the typed cooldown to its node when the selection is cleared', () => {
    renderWithProviders(<Editor initial={[cueCalled('A', 0), cueCalled('B', 1000)]} />)
    act(() => select('A'))

    typeInto('Cooldown (ms)', '250')
    act(() => select(null))

    expect(payloadOf<AudioEventNode>('A').cooldownMs).toBe(250)
    expect(payloadOf<AudioEventNode>('B').cooldownMs).toBe(1000)
  })
})
