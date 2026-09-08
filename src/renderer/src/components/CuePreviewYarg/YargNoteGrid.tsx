/**
 * The notes each instrument is playing this frame, as a row of pips per instrument.
 *
 * A pip lit for a note takes that note's own colour, and every other pip stays dimmed. Drums get two
 * rows because a pad and the cymbal above it are separate notes of the same colour.
 */
import React from 'react'
import { DrumNoteType, InstrumentNoteType } from '../../../../photonics-dmx/cues/types/cueTypes'

const PIP_CLASS = 'w-6 h-6 rounded text-xs flex items-center justify-center font-bold'
const DIM_CLASS = 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'

const FRET_NOTES = [
  InstrumentNoteType.Green,
  InstrumentNoteType.Red,
  InstrumentNoteType.Yellow,
  InstrumentNoteType.Blue,
  InstrumentNoteType.Orange,
] as const

const FRET_PIPS: Record<string, { label: string; lit: string }> = {
  [InstrumentNoteType.Green]: { label: 'G', lit: 'bg-green-500' },
  [InstrumentNoteType.Red]: { label: 'R', lit: 'bg-red-500' },
  [InstrumentNoteType.Yellow]: { label: 'Y', lit: 'bg-yellow-500' },
  [InstrumentNoteType.Blue]: { label: 'B', lit: 'bg-blue-500' },
  [InstrumentNoteType.Orange]: { label: 'O', lit: 'bg-orange-500' },
}

const DRUM_PADS = [
  DrumNoteType.GreenDrum,
  DrumNoteType.RedDrum,
  DrumNoteType.YellowDrum,
  DrumNoteType.BlueDrum,
] as const

const DRUM_CYMBALS = [
  DrumNoteType.GreenCymbal,
  DrumNoteType.YellowCymbal,
  DrumNoteType.BlueCymbal,
  DrumNoteType.Kick,
] as const

const DRUM_PIPS: Record<string, { label: string; lit: string }> = {
  [DrumNoteType.GreenDrum]: { label: 'G', lit: 'bg-green-500' },
  [DrumNoteType.RedDrum]: { label: 'R', lit: 'bg-red-500' },
  [DrumNoteType.YellowDrum]: { label: 'Y', lit: 'bg-yellow-500' },
  [DrumNoteType.BlueDrum]: { label: 'B', lit: 'bg-blue-500' },
  [DrumNoteType.GreenCymbal]: { label: 'GC', lit: 'bg-green-500' },
  [DrumNoteType.YellowCymbal]: { label: 'YC', lit: 'bg-yellow-500' },
  [DrumNoteType.BlueCymbal]: { label: 'BC', lit: 'bg-blue-500' },
  [DrumNoteType.Kick]: { label: 'KD', lit: 'bg-orange-500' },
}

interface NoteRowProps {
  notes: ReadonlyArray<string>
  pips: Record<string, { label: string; lit: string }>
  active: ReadonlySet<string>
}

const NoteRow: React.FC<NoteRowProps> = ({ notes, pips, active }) => (
  <div className="flex flex-wrap gap-1">
    {notes.map((note) => {
      const pip = pips[note]
      return (
        <div
          key={String(note)}
          className={`${PIP_CLASS} ${active.has(note) ? `text-white ${pip.lit}` : DIM_CLASS}`}>
          {pip.label}
        </div>
      )
    })}
  </div>
)

export interface ActiveInstrumentNotes {
  guitar: ReadonlySet<InstrumentNoteType>
  bass: ReadonlySet<InstrumentNoteType>
  keys: ReadonlySet<InstrumentNoteType>
  drums: ReadonlySet<DrumNoteType>
}

const FRETTED: ReadonlyArray<{ name: string; key: 'guitar' | 'bass' | 'keys' }> = [
  { name: 'Guitar', key: 'guitar' },
  { name: 'Bass', key: 'bass' },
  { name: 'Keys', key: 'keys' },
]

const YargNoteGrid: React.FC<{ activeInstrumentNotes: ActiveInstrumentNotes }> = ({
  activeInstrumentNotes,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    {FRETTED.map(({ name, key }) => (
      <div key={key}>
        <p className="font-medium mb-1">{name}</p>
        <NoteRow notes={FRET_NOTES} pips={FRET_PIPS} active={activeInstrumentNotes[key]} />
      </div>
    ))}
    <div>
      <p className="font-medium mb-1">Drums</p>
      <div className="space-y-2">
        <NoteRow notes={DRUM_PADS} pips={DRUM_PIPS} active={activeInstrumentNotes.drums} />
        <NoteRow notes={DRUM_CYMBALS} pips={DRUM_PIPS} active={activeInstrumentNotes.drums} />
      </div>
    </div>
  </div>
)

export default YargNoteGrid
