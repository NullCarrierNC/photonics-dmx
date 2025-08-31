import React, { useState, useEffect, useRef } from 'react';
import { CueData, InstrumentNoteType, DrumNoteType } from '../../../photonics-dmx/cues/cueTypes';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import { useAtom } from 'jotai';
import { currentCueStateAtom, yargListenerEnabledAtom } from '../atoms';

interface CuePreviewYargProps {
    className?: string;
    showBeatIndicator?: boolean;
    showMeasureIndicator?: boolean;
    showKeyframeIndicator?: boolean;
    manualBeatType?: string;
    manualMeasureType?: string;
    manualKeyframeType?: string;
    simulationMode?: boolean;
}

const CuePreviewYarg: React.FC<CuePreviewYargProps> = ({
    className = '',
    showBeatIndicator = false,
    showMeasureIndicator = false,
    showKeyframeIndicator = false,
    manualBeatType = 'Manual Beat',
    manualMeasureType = 'Manual Measure',
    manualKeyframeType = 'Manual Keyframe',
    simulationMode = false
}) => {
    const [currentCueData, setCurrentCueData] = useState<CueData | null>(null);
    const [cueState] = useAtom(currentCueStateAtom);
    const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom);
    
    // Separate state for primary and secondary cues
    const [primaryCueName, setPrimaryCueName] = useState<string>('');
    const [primaryCueCounter, setPrimaryCueCounter] = useState<number>(0);
    const [secondaryCueName, setSecondaryCueName] = useState<string>('');
    const [secondaryCueCounter, setSecondaryCueCounter] = useState<number>(0);

    // State for beat and measure indicators
    const [beatReceived, setBeatReceived] = useState(false);
    const [measureReceived, setMeasureReceived] = useState(false);
    const [lastBeatType, setLastBeatType] = useState<string | null>(null);
    const [lastMeasureType, setLastMeasureType] = useState<string | null>(null);
    // State for keyframe indicator
    const [keyframeReceived, setKeyframeReceived] = useState(false);
    const [lastKeyframeType, setLastKeyframeType] = useState<string | null>(null);
    
    // State for instrument note indicators
    const [activeInstrumentNotes, setActiveInstrumentNotes] = useState<{
        guitar: Set<InstrumentNoteType>;
        bass: Set<InstrumentNoteType>;
        keys: Set<InstrumentNoteType>;
        drums: Set<DrumNoteType>;
    }>({
        guitar: new Set<InstrumentNoteType>(),
        bass: new Set<InstrumentNoteType>(),
        keys: new Set<InstrumentNoteType>(),
        drums: new Set<DrumNoteType>()
    });

    // Refs to track previous values for comparison
    const prevBeatRef = useRef<string | null>(null);
    const prevMeasureRef = useRef<number | undefined>(undefined);
    const prevKeyframeRef = useRef<string | null>(null);

    const labelForInstrumentNote = (note: InstrumentNoteType) => {
        switch (note) {
            case InstrumentNoteType.Green: return 'G';
            case InstrumentNoteType.Red: return 'R';
            case InstrumentNoteType.Yellow: return 'Y';
            case InstrumentNoteType.Blue: return 'B';
            case InstrumentNoteType.Orange: return 'O';
            default: return '';
        }
    };

    const labelForDrumNote = (note: DrumNoteType) => {
        if (note === DrumNoteType.Kick) return 'KD';
        switch (note) {
            case DrumNoteType.GreenDrum: return 'G'
            case DrumNoteType.GreenCymbal: return 'GC';
            case DrumNoteType.RedDrum: return 'R';
            case DrumNoteType.YellowDrum: return 'Y';
            case DrumNoteType.YellowCymbal: return 'YC';
            case DrumNoteType.BlueDrum: return 'B';
            case DrumNoteType.BlueCymbal: return 'BC';
            default: return '';
        }
    };

    // Update primary/secondary cue display based on cue state changes
    useEffect(() => {
        if (cueState?.cueType && cueState?.cueStyle) {
            if (cueState.cueStyle === 'primary') {
                // Clear secondary when a different primary cue starts (secondary cues are transient)
                if (primaryCueName && primaryCueName !== cueState.cueType) {
                    setSecondaryCueName('');
                    setSecondaryCueCounter(0);
                }
                setPrimaryCueName(cueState.cueType);
                setPrimaryCueCounter(cueState.counter);
            } else if (cueState.cueStyle === 'secondary') {
                setSecondaryCueName(cueState.cueType);
                setSecondaryCueCounter(cueState.counter);
            }
        }
    }, [cueState, primaryCueName]);

    // Handle manual indicators via props
    useEffect(() => {
        if (showBeatIndicator) {
            setLastBeatType(manualBeatType);
            setBeatReceived(true);

            // Clear beat indicator after 100ms
            const timer = setTimeout(() => {
                setBeatReceived(false);
            }, 100);

            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showBeatIndicator, manualBeatType]);

    useEffect(() => {
        if (showKeyframeIndicator) {
            setLastKeyframeType(manualKeyframeType);
            setKeyframeReceived(true);

            // Clear keyframe indicator after 200ms
            const timer = setTimeout(() => {
                setKeyframeReceived(false);
            }, 200);

            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showKeyframeIndicator, manualKeyframeType]);

    useEffect(() => {
        if (showMeasureIndicator) {
            setLastMeasureType(manualMeasureType);
            setMeasureReceived(true);

            // Clear measure indicator after 200ms
            const timer = setTimeout(() => {
                setMeasureReceived(false);
            }, 200);

            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showMeasureIndicator, manualMeasureType]);

    // Listen for cue events when YARG listener is enabled or in simulation mode
    useEffect(() => {
        if (!yargListenerEnabled && !simulationMode) {
            // Clear data when listener is disabled and not in simulation mode
            setCurrentCueData(null);
            setPrimaryCueName('');
            setPrimaryCueCounter(0);
            setSecondaryCueName('');
            setSecondaryCueCounter(0);
            setBeatReceived(false);
            setMeasureReceived(false);
            setKeyframeReceived(false);
            setLastBeatType(null);
            setLastMeasureType(null);
            setLastKeyframeType(null);
            return;
        }

        // Only tell the main process to start sending cue data if not in simulation mode
        if (!simulationMode) {
            window?.electron?.ipcRenderer?.send('set-listen-cue-data', true);
        }

        const handleCueData = (_: unknown, cueData: CueData) => {
            // Beat detection - check for beat values in the beat property
            if (cueData.beat && cueData.beat !== 'Unknown') {
                if (cueData.beat !== prevBeatRef.current) {
                    // Check if it's a beat event
                    if (cueData.beat === 'Strong' || cueData.beat === 'Weak') {
                        setLastBeatType(cueData.beat);
                        setBeatReceived(true);

                        // Clear beat indicator
                        setTimeout(() => {
                            setBeatReceived(false);
                        }, 200);
                    }
                    // Check if it's a measure event coming through the beat property
                    else if (cueData.beat === 'Measure') {
                        setLastMeasureType('Measure Event');
                        setMeasureReceived(true);

                        // Clear measure indicator
                        setTimeout(() => {
                            setMeasureReceived(false);
                        }, 250);
                    }
                }

                // Update our ref with the current beat value
                prevBeatRef.current = cueData.beat;
            }

            // Measure detection - check if the measure number changed
            if (cueData.measureOrBeat !== undefined) {
                // Check if it's a new measure (compare with our ref)
                if (cueData.measureOrBeat !== prevMeasureRef.current) {
                    setLastMeasureType(`Measure ${cueData.measureOrBeat}`);
                    setMeasureReceived(true);

                    // Clear measure indicator after 500ms
                    setTimeout(() => {
                        setMeasureReceived(false);
                    }, 250);
                }

                // Update our ref with the current measure value
                prevMeasureRef.current = cueData.measureOrBeat;
            }

            // Keyframe detection - check if the keyframe changed
            if (cueData.keyframe && cueData.keyframe !== 'Unknown') {
                if (cueData.keyframe !== prevKeyframeRef.current) {
                    // Only show keyframes that aren't "Off"
                    if (cueData.keyframe !== 'Off') {
                        setLastKeyframeType(cueData.keyframe);
                        setKeyframeReceived(true);

                        // Clear keyframe indicator after 500ms
                        setTimeout(() => {
                            setKeyframeReceived(false);
                        }, 250);
                    }
                }

                // Update our ref with the current keyframe value
                prevKeyframeRef.current = cueData.keyframe;
            }

            // Handle instrument notes
            if (cueData.guitarNotes && cueData.guitarNotes.length > 0) {
                const guitarNotes = cueData.guitarNotes.filter(note => note !== InstrumentNoteType.None);
                setActiveInstrumentNotes(prev => ({
                    ...prev,
                    guitar: new Set(guitarNotes.map(note => note))
                }));

                // Clear guitar notes after 100ms
                setTimeout(() => {
                    setActiveInstrumentNotes(prev => ({
                        ...prev,
                        guitar: new Set<InstrumentNoteType>()
                    }));
                }, 100);
            }

            if (cueData.bassNotes && cueData.bassNotes.length > 0) {
                const bassNotes = cueData.bassNotes.filter(note => note !== InstrumentNoteType.None);
                setActiveInstrumentNotes(prev => ({
                    ...prev,
                    bass: new Set(bassNotes.map(note => note))
                }));

                // Clear bass notes after 100ms
                setTimeout(() => {
                    setActiveInstrumentNotes(prev => ({
                        ...prev,
                        bass: new Set<InstrumentNoteType>()
                    }));
                }, 100);
            }

            if (cueData.keysNotes && cueData.keysNotes.length > 0) {
                const keysNotes = cueData.keysNotes.filter(note => note !== InstrumentNoteType.None);
                setActiveInstrumentNotes(prev => ({
                    ...prev,
                    keys: new Set(keysNotes.map(note => note))
                }));

                // Clear keys notes after 100ms
                setTimeout(() => {
                    setActiveInstrumentNotes(prev => ({
                        ...prev,
                        keys: new Set<InstrumentNoteType>()
                    }));
                }, 100);
            }

            if (cueData.drumNotes && cueData.drumNotes.length > 0) {
                const drumNotes = cueData.drumNotes.filter(note => note !== DrumNoteType.None);
                setActiveInstrumentNotes(prev => ({
                    ...prev,
                    drums: new Set(drumNotes.map(note => note))
                }));

                // Clear drum notes after 100ms
                setTimeout(() => {
                    setActiveInstrumentNotes(prev => ({
                        ...prev,
                        drums: new Set<DrumNoteType>()
                    }));
                }, 100);
            }

            setCurrentCueData(cueData);
        };

        // Add the listener for handled cues
        addIpcListener('cue-handled', handleCueData);

        return () => {
            // Tell the main process to stop sending cue data
            window?.electron?.ipcRenderer?.send('set-listen-cue-data', false);

            // Clean up
            removeIpcListener('cue-handled', handleCueData);
        };
    }, [yargListenerEnabled, simulationMode]);

    const getTitle = () => {
        if (cueState?.groupName) {
            return `Current Cue Group: ${cueState.groupName}${cueState.isFallback ? ' - fallback' : ''}`;
        }
        return 'Current Cue Group';
    };

    const getAutoGenStatus = () => {
        if (simulationMode) {
            return 'Simulation';
        }
        if (currentCueData?.autoGenTrack !== undefined) {
            return currentCueData.autoGenTrack ? 'Auto-Generated' : 'Tracked';
        }
        return null;
    };

    const autoGenStatus = getAutoGenStatus();
    return (
        <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
            <div className="flex justify-between items-center mb-1">
                <h3 className="text-lg font-semibold">{getTitle()}</h3>
                {autoGenStatus && (
                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                        autoGenStatus === 'Simulation' 
                            ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                            : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    }`}>
                        {autoGenStatus}
                    </span>
                )}
            </div>
            {currentCueData ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* First row - 4 columns */}
                    <div>
                        <p><span className="font-medium">Primary:</span> {primaryCueName || 'None'} <span className="text-xs text-gray-500">{primaryCueName && primaryCueCounter > 0 ? `(${primaryCueCounter})` : ''}</span></p>
                        <p><span className="font-medium">Secondary:</span> {secondaryCueName || ''} <span className="text-xs text-gray-500">{secondaryCueName && secondaryCueCounter > 0 ? `(${secondaryCueCounter})` : ''}</span></p>
                    </div>

                    <div>
                        <p className="font-medium">Strobe State:</p>
                        <p>{currentCueData.strobeState || 'None'}</p>
                    </div>

                    <div>
                        <p className="font-medium">BPM:</p>
                        <p>{currentCueData.beatsPerMinute}</p>
                    </div>

                    <div>
                        <p className="font-medium">Auto-Gen:</p>
                        <p>{currentCueData.autoGenTrack !== undefined ? (currentCueData.autoGenTrack ? 'Yes' : 'No') : 'Unknown'}</p>
                    </div>
                    
                    {/* Second row - 4 columns */}
                    {currentCueData.measureOrBeat !== undefined && (
                        <div>
                            <p className="font-medium">Current Measure:</p>
                            <p>Measure {currentCueData.measureOrBeat}</p>
                        </div>
                    )}

                    {/* Beat event detector */}
                    <div>
                        <p className="font-medium">Beat Event:</p>
                        <div className={`p-2 rounded ${beatReceived ? 'bg-yellow-200 dark:bg-yellow-500' : 'bg-gray-100 dark:bg-gray-600'}`}>
                            {beatReceived ?
                                <p className="font-bold">{lastBeatType}</p> :
                                <p>Waiting for beat...</p>
                            }
                        </div>
                    </div>

                    {/* Measure event detector */}
                    <div>
                        <p className="font-medium">Measure Event:</p>
                        <div className={`p-2 rounded ${measureReceived ? 'bg-yellow-200 dark:bg-yellow-500' : 'bg-gray-100 dark:bg-gray-600'}`}>
                            {measureReceived ?
                                <p className="font-bold">{lastMeasureType}</p> :
                                <p>Waiting for measure...</p>
                            }
                        </div>
                    </div>

                    {/* Keyframe event detector */}
                    <div>
                        <p className="font-medium">Keyframe Event:</p>
                        <div className={`p-2 rounded ${keyframeReceived ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-gray-100 dark:bg-gray-600'}`}>
                            {keyframeReceived ?
                                <p className="font-bold">{lastKeyframeType}</p> :
                                <p>Off</p>
                            }
                        </div>
                    </div>

                    {/* Venue Size */}
                    <div>
                        <p className="font-medium">Venue Size:</p>
                        <div className="p-2 rounded bg-gray-100 dark:bg-gray-600">
                            <p>{currentCueData.venueSize || 'Unknown'}</p>
                        </div>
                    </div>
                </div>
                
                {/* Instrument Notes Section */}
                <div className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Guitar */}
                        <div>
                            <p className="font-medium mb-1">Guitar</p>
                            <div className="flex flex-wrap gap-1">
                                {[InstrumentNoteType.Green, InstrumentNoteType.Red, InstrumentNoteType.Yellow, InstrumentNoteType.Blue, InstrumentNoteType.Orange].map((note) => (
                                    <div
                                        key={String(note)}
                                        className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                            activeInstrumentNotes.guitar.has(note)
                                                ? 'text-white' +
                                                  (note === InstrumentNoteType.Green ? ' bg-green-500' :
                                                   note === InstrumentNoteType.Red ? ' bg-red-500' :
                                                   note === InstrumentNoteType.Yellow ? ' bg-yellow-500' :
                                                   note === InstrumentNoteType.Blue ? ' bg-blue-500' :
                                                   note === InstrumentNoteType.Orange ? ' bg-orange-500' : '')
                                                : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                        }`}
                                    >
                                        {labelForInstrumentNote(note)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Bass */}
                        <div>
                            <p className="font-medium mb-1">Bass</p>
                            <div className="flex flex-wrap gap-1">
                                {[InstrumentNoteType.Green, InstrumentNoteType.Red, InstrumentNoteType.Yellow, InstrumentNoteType.Blue, InstrumentNoteType.Orange].map((note) => (
                                    <div
                                        key={String(note)}
                                        className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                            activeInstrumentNotes.bass.has(note)
                                                ? 'text-white' +
                                                  (note === InstrumentNoteType.Green ? ' bg-green-500' :
                                                   note === InstrumentNoteType.Red ? ' bg-red-500' :
                                                   note === InstrumentNoteType.Yellow ? ' bg-yellow-500' :
                                                   note === InstrumentNoteType.Blue ? ' bg-blue-500' :
                                                   note === InstrumentNoteType.Orange ? ' bg-orange-500' : '')
                                                : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                        }`}
                                    >
                                        {labelForInstrumentNote(note)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Keys */}
                        <div>
                            <p className="font-medium mb-1">Keys</p>
                            <div className="flex flex-wrap gap-1">
                                {[InstrumentNoteType.Green, InstrumentNoteType.Red, InstrumentNoteType.Yellow, InstrumentNoteType.Blue, InstrumentNoteType.Orange].map((note) => (
                                    <div
                                        key={String(note)}
                                        className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                            activeInstrumentNotes.keys.has(note)
                                                ? 'text-white' +
                                                  (note === InstrumentNoteType.Green ? ' bg-green-500' :
                                                   note === InstrumentNoteType.Red ? ' bg-red-500' :
                                                   note === InstrumentNoteType.Yellow ? ' bg-yellow-500' :
                                                   note === InstrumentNoteType.Blue ? ' bg-blue-500' :
                                                   note === InstrumentNoteType.Orange ? ' bg-orange-500' : '')
                                                : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                        }`}
                                    >
                                        {labelForInstrumentNote(note)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Drums */}
                        <div>
                            <p className="font-medium mb-1">Drums</p>
                            <div className="space-y-2">
                                {/* GRYB Drum Colors */}
                                <div className="flex flex-wrap gap-1">
                                    {[DrumNoteType.GreenDrum, DrumNoteType.RedDrum, DrumNoteType.YellowDrum, DrumNoteType.BlueDrum].map((note) => (
                                        <div
                                            key={String(note)}
                                            className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                                activeInstrumentNotes.drums.has(note)
                                                    ? 'text-white' +
                                                      (note === DrumNoteType.GreenDrum ? ' bg-green-500' :
                                                       note === DrumNoteType.RedDrum ? ' bg-red-500' :
                                                       note === DrumNoteType.YellowDrum ? ' bg-yellow-500' :
                                                       note === DrumNoteType.BlueDrum ? ' bg-blue-500' : '')
                                                    : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                            }`}
                                        >
                                            {labelForDrumNote(note)}
                                        </div>
                                    ))}
                                </div>
                                {/* Cymbals and Kick */}
                                <div className="flex flex-wrap gap-1">
                                    {[DrumNoteType.GreenCymbal, DrumNoteType.YellowCymbal, DrumNoteType.BlueCymbal, DrumNoteType.Kick].map((note) => (
                                        <div
                                            key={String(note)}
                                            className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                                                activeInstrumentNotes.drums.has(note)
                                                    ? 'text-white' +
                                                      (note === DrumNoteType.GreenCymbal ? ' bg-green-500' :
                                                       note === DrumNoteType.YellowCymbal ? ' bg-yellow-500' :
                                                                                                          note === DrumNoteType.BlueCymbal ? ' bg-blue-500' :
                                                   note === DrumNoteType.Kick ? ' bg-orange-500' : '')
                                                    : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                                            }`}
                                        >
                                            {labelForDrumNote(note)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <p className="text-gray-500 dark:text-gray-400">No active YARG cue</p>
            )}
        </div>
    );
};

export default CuePreviewYarg;
