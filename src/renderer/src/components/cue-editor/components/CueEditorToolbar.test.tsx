/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import CueEditorToolbar from './CueEditorToolbar'
import type { NodeCueKind } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

const renderToolbar = (
  cuePlatform: 'yarg' | 'audio' | 'rb3',
  cueKind: NodeCueKind,
  isEffectMode = false,
) => {
  const onCueKindChange = jest.fn()
  render(
    <CueEditorToolbar
      cuePlatform={cuePlatform}
      cueKind={cueKind}
      isEffectMode={isEffectMode}
      onCuePlatformChange={jest.fn()}
      onCueKindChange={onCueKindChange}
      onEffectToggle={jest.fn()}
      onNewFile={jest.fn()}
      onSave={jest.fn()}
      onImport={jest.fn()}
      onExport={jest.fn()}
      onDelete={jest.fn()}
      hasEditorDoc={false}
      hasFile={false}
      newFileLabel="New Cue File"
      importLabel="Import Cue File"
      exportLabel="Export Cue File"
      deleteLabel="Delete"
    />,
  )
  return { onCueKindChange }
}

describe('CueEditorToolbar kind toggle', () => {
  it.each(['yarg', 'audio', 'rb3'] as const)('offers Lighting and Motion on %s', (platform) => {
    renderToolbar(platform, 'lighting')
    expect(screen.getByRole('button', { name: 'Lighting' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Motion' })).toBeDefined()
  })

  it('hides the kind toggle in effect mode, which has no motion side', () => {
    renderToolbar('yarg', 'lighting', true)
    expect(screen.queryByRole('button', { name: 'Motion' })).toBeNull()
  })

  it('reports the motion kind from rb3', () => {
    const { onCueKindChange } = renderToolbar('rb3', 'lighting')
    screen.getByRole('button', { name: 'Motion' }).click()
    expect(onCueKindChange).toHaveBeenCalledWith('motion')
  })
})
