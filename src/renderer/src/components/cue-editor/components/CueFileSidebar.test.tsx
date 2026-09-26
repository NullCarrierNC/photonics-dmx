/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import CueFileSidebar from './CueFileSidebar'

afterEach(() => cleanup())

const cueFile = (fields: Partial<NodeCueFileSummary>): NodeCueFileSummary => ({
  path: `/cues/${fields.groupId ?? 'file'}.json`,
  groupId: 'file',
  groupName: 'File',
  cueCount: 2,
  lightingCueCount: 2,
  motionCueCount: 0,
  mode: 'yarg',
  updatedAt: 0,
  ...fields,
})

const effectFile = (fields: Partial<EffectFileSummary>): EffectFileSummary => ({
  path: '/effects/file.json',
  groupId: 'fx',
  groupName: 'Effects',
  effectCount: 3,
  mode: 'yarg',
  updatedAt: 0,
  ...fields,
})

function renderSidebar(options: {
  fileList?: NodeCueFileSummary[]
  effectFileList?: EffectFileSummary[]
  isEffectMode?: boolean
}): void {
  const noop = jest.fn()
  renderWithProviders(
    <CueFileSidebar
      mode="yarg"
      cueKind="lighting"
      isEffectMode={options.isEffectMode ?? false}
      fileList={options.fileList ?? []}
      effectFileList={options.effectFileList ?? []}
      editorDoc={null}
      selectedCueId={null}
      onSelectFile={noop}
      onSelectEffectFile={noop}
      onReload={noop}
      onAddCue={noop}
      onAddEffect={noop}
      onRemoveCue={noop}
      onRemoveEffect={noop}
      onSelectCue={noop}
    />,
  )
}

describe('CueFileSidebar', () => {
  it('shows the compile errors a cue file loaded with', () => {
    renderSidebar({
      fileList: [
        cueFile({
          groupId: 'mine',
          groupName: 'Mine',
          errors: ["cue 'Dischord': Action 'a1' color.name 'ultraviolet' is not a known Color."],
        }),
      ],
    })

    expect(screen.getByText(/cue 'Dischord'.*'ultraviolet' is not a known Color/)).toBeTruthy()
  })

  it('lists a cue file that failed to load, with the reason', () => {
    renderSidebar({
      fileList: [
        cueFile({
          groupId: 'broken',
          groupName: 'broken',
          cueCount: 0,
          lightingCueCount: 0,
          errors: ['No cue in the group compiled.'],
        }),
      ],
    })

    expect(screen.getByText('broken')).toBeTruthy()
    expect(screen.getByText('No cue in the group compiled.')).toBeTruthy()
  })

  it('shows what a load changed in an effect file an older build wrote', () => {
    renderSidebar({
      isEffectMode: true,
      effectFileList: [effectFile({ migrations: ["Variable 'beat-count' became 'beat_count'."] })],
    })

    expect(screen.getByText("Variable 'beat-count' became 'beat_count'.")).toBeTruthy()
  })
})
