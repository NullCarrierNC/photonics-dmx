import React from 'react'
import { InstrumentNoteType, DrumNoteType } from '../../../../photonics-dmx/cues/types/cueTypes'

type InstrumentType = 'guitar' | 'bass' | 'keys' | 'drums'

interface CueSimulationInstrumentProps {
  selectedInstrument: InstrumentType
  onInstrumentChange: (instrument: InstrumentType) => void
  onSimulateNote: (noteType: string) => void
  disabled: boolean
}

const DRUM_NOTE_BUTTON_CLASS =
  'px-3 py-1 text-xs rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed'
const INSTRUMENT_NOTE_BUTTON_CLASS =
  'px-3 py-1 text-xs rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed'

function drumNoteClass(note: string): string {
  const base = `${DRUM_NOTE_BUTTON_CLASS} `
  if (note === DrumNoteType.GreenDrum || note === DrumNoteType.GreenCymbal)
    return base + 'bg-green-500 text-white'
  if (note === DrumNoteType.RedDrum) return base + 'bg-red-500 text-white'
  if (note === DrumNoteType.YellowDrum || note === DrumNoteType.YellowCymbal)
    return base + 'bg-yellow-500 text-white'
  if (note === DrumNoteType.BlueDrum || note === DrumNoteType.BlueCymbal)
    return base + 'bg-blue-500 text-white'
  if (note === DrumNoteType.Kick) return base + 'bg-orange-500 text-white'
  return base + 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200'
}

function instrumentNoteClass(note: string): string {
  const base = `${INSTRUMENT_NOTE_BUTTON_CLASS} `
  if (note === InstrumentNoteType.Green) return base + 'bg-green-500 text-white'
  if (note === InstrumentNoteType.Red) return base + 'bg-red-500 text-white'
  if (note === InstrumentNoteType.Yellow) return base + 'bg-yellow-500 text-white'
  if (note === InstrumentNoteType.Blue) return base + 'bg-blue-500 text-white'
  if (note === InstrumentNoteType.Orange) return base + 'bg-orange-500 text-white'
  if (note === InstrumentNoteType.Open) return base + 'bg-gray-500 text-white'
  return base + 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200'
}

const DRUM_NOTES = [
  DrumNoteType.GreenDrum,
  DrumNoteType.RedDrum,
  DrumNoteType.YellowDrum,
  DrumNoteType.BlueDrum,
  DrumNoteType.GreenCymbal,
  DrumNoteType.YellowCymbal,
  DrumNoteType.BlueCymbal,
  DrumNoteType.Kick,
]

const INSTRUMENT_NOTES = [
  InstrumentNoteType.Green,
  InstrumentNoteType.Red,
  InstrumentNoteType.Yellow,
  InstrumentNoteType.Blue,
  InstrumentNoteType.Orange,
]

/**
 * Instrument selector and note simulation buttons for Cue Simulation.
 */
export const CueSimulationInstrument: React.FC<CueSimulationInstrumentProps> = ({
  selectedInstrument,
  onInstrumentChange,
  onSimulateNote,
  disabled,
}) => (
  <div className="mt-6">
    <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
      Instrument Simulation
    </h3>
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Instrument
        </label>
        <select
          value={selectedInstrument}
          onChange={(e) => onInstrumentChange(e.target.value as InstrumentType)}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
          style={{ width: '150px' }}
          disabled={disabled}>
          <option value="bass">Bass</option>
          <option value="drums">Drums</option>
          <option value="guitar">Guitar</option>
          <option value="keys">Keys</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <div className="flex flex-wrap gap-2">
          {selectedInstrument === 'drums'
            ? DRUM_NOTES.map((note) => (
                <button
                  key={note}
                  onClick={() => onSimulateNote(note)}
                  className={drumNoteClass(note)}
                  disabled={disabled}>
                  {note}
                </button>
              ))
            : INSTRUMENT_NOTES.map((note) => (
                <button
                  key={note}
                  onClick={() => onSimulateNote(note)}
                  className={instrumentNoteClass(note)}
                  disabled={disabled}>
                  {note}
                </button>
              ))}
        </div>
      </div>
    </div>
  </div>
)

export default CueSimulationInstrument
