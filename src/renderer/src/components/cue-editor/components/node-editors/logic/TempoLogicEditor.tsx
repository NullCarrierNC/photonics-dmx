import React from 'react'
import type { TempoLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface TempoLogicEditorProps extends LogicEditorCommonProps {
  node: TempoLogicNode
}

const parseNumberList = (raw: string): number[] =>
  raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))

/** Reads the song tempo once and writes the derived beat/bar/phrase durations (and an optional BPM-banded
 *  cycle count), replacing the read/guard/clamp/multiply/band chain every tempo-locked cue repeats. */
const TempoLogicEditor: React.FC<TempoLogicEditorProps> = ({
  node,
  availableVariables,
  updateNode,
}) => {
  const varField = (
    label: string,
    key: 'assignBeatMs' | 'assignBarMs' | 'assignPhraseMs' | 'assignCycles',
    placeholder: string,
  ) => (
    <label className="flex flex-col font-medium">
      {label}
      <input
        type="text"
        className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={node[key] ?? ''}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => updateNode({ [key]: event.target.value || undefined })}
      />
    </label>
  )

  return (
    <div className="space-y-2 text-xs">
      {varField('Beat ms → variable', 'assignBeatMs', 'beat_ms')}
      {varField('Bar ms → variable (optional)', 'assignBarMs', 'bar_ms')}
      {varField('Phrase ms → variable (optional)', 'assignPhraseMs', 'phrase_ms')}
      {varField('Cycles → variable (optional)', 'assignCycles', 'wave_cycles')}

      <ValueSourceEditor
        label="Beats per bar (default 4)"
        value={node.beatsPerBar}
        onChange={(next) => updateNode({ beatsPerBar: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Bars per phrase (default 2)"
        value={node.barsPerPhrase}
        onChange={(next) => updateNode({ barsPerPhrase: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Min beat ms (default 250)"
        value={node.minBeatMs}
        onChange={(next) => updateNode({ minBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Max beat ms (default 1000)"
        value={node.maxBeatMs}
        onChange={(next) => updateNode({ maxBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label="Fallback beat ms when silent (default 461)"
        value={node.fallbackBeatMs}
        onChange={(next) => updateNode({ fallbackBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />

      {node.assignCycles && (
        <>
          <label className="flex flex-col font-medium">
            Cycle BPM bands (ascending, default 110, 150)
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node.cycleBands ?? [110, 150]).join(', ')}
              spellCheck={false}
              onChange={(event) => updateNode({ cycleBands: parseNumberList(event.target.value) })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Cycle values (one more than bands, default 2, 3, 5)
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node.cycleValues ?? [2, 3, 5]).join(', ')}
              spellCheck={false}
              onChange={(event) => updateNode({ cycleValues: parseNumberList(event.target.value) })}
            />
          </label>
        </>
      )}
    </div>
  )
}

export default TempoLogicEditor
