import React from 'react'
import type { TempoLogicNode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { TEMPO_DEFAULTS } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import ValueSourceEditor from '../../shared/ValueSourceEditor'
import type { LogicEditorCommonProps } from './LogicNodeEditorShared'

export interface TempoLogicEditorProps extends LogicEditorCommonProps {
  node: TempoLogicNode
}

/** Parse a comma-separated number field, dropping empty segments (trailing/double commas) first so they
 *  don't map to a spurious 0 (Number('') === 0). */
const parseNumberList = (raw: string): number[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
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
        label={`Beats per bar (default ${TEMPO_DEFAULTS.beatsPerBar})`}
        value={node.beatsPerBar}
        onChange={(next) => updateNode({ beatsPerBar: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label={`Bars per phrase (default ${TEMPO_DEFAULTS.barsPerPhrase})`}
        value={node.barsPerPhrase}
        onChange={(next) => updateNode({ barsPerPhrase: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label={`Min beat ms (default ${TEMPO_DEFAULTS.minBeatMs})`}
        value={node.minBeatMs}
        onChange={(next) => updateNode({ minBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label={`Max beat ms (default ${TEMPO_DEFAULTS.maxBeatMs})`}
        value={node.maxBeatMs}
        onChange={(next) => updateNode({ maxBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />
      <ValueSourceEditor
        label={`Fallback beat ms when silent (default ${TEMPO_DEFAULTS.fallbackBeatMs})`}
        value={node.fallbackBeatMs}
        onChange={(next) => updateNode({ fallbackBeatMs: next })}
        expected="number"
        availableVariables={availableVariables}
      />

      {node.assignCycles && (
        <>
          <label className="flex flex-col font-medium">
            Cycle BPM bands (ascending, default {TEMPO_DEFAULTS.cycleBands.join(', ')})
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node.cycleBands ?? TEMPO_DEFAULTS.cycleBands).join(', ')}
              spellCheck={false}
              onChange={(event) => updateNode({ cycleBands: parseNumberList(event.target.value) })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Cycle values (one more than bands, default {TEMPO_DEFAULTS.cycleValues.join(', ')})
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 font-mono bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node.cycleValues ?? TEMPO_DEFAULTS.cycleValues).join(', ')}
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
