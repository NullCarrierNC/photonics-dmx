import React, { useState, useEffect, useRef } from 'react';
import { CueData } from '../../../photonics-dmx/cues/cueTypes';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';

interface CuePreviewProps {
    className?: string;
    showBeatIndicator?: boolean;
    showMeasureIndicator?: boolean;
    showKeyframeIndicator?: boolean;
    manualBeatType?: string;
    manualMeasureType?: string;
    manualKeyframeType?: string;
}

interface CueSourceInfo {
    groupName: string | null;
    isFromDefault: boolean;
}

const CuePreview: React.FC<CuePreviewProps> = ({
    className = '',
    showBeatIndicator = false,
    showMeasureIndicator = false,
    showKeyframeIndicator = false,
    manualBeatType = 'Manual Beat',
    manualMeasureType = 'Manual Measure',
    manualKeyframeType = 'Manual Keyframe'
}) => {
    const [currentCueData, setCurrentCueData] = useState<CueData | null>(null);
    const [cueSourceInfo, setCueSourceInfo] = useState<CueSourceInfo | null>(null);

    // State for beat and measure indicators
    const [beatReceived, setBeatReceived] = useState(false);
    const [measureReceived, setMeasureReceived] = useState(false);
    const [lastBeatType, setLastBeatType] = useState<string | null>(null);
    const [lastMeasureType, setLastMeasureType] = useState<string | null>(null);
    // State for keyframe indicator
    const [keyframeReceived, setKeyframeReceived] = useState(false);
    const [lastKeyframeType, setLastKeyframeType] = useState<string | null>(null);

    // Refs to track previous values for comparison
    const prevBeatRef = useRef<string | null>(null);
    const prevMeasureRef = useRef<number | undefined>(undefined);
    const prevKeyframeRef = useRef<string | null>(null);

    // Fetch cue source group information when cue changes
    useEffect(() => {
        const fetchCueSourceInfo = async () => {
            if (currentCueData?.lightingCue && currentCueData.lightingCue !== 'None') {
                try {
                    const sourceInfo = await window.electron.ipcRenderer.invoke('get-cue-source-group', currentCueData.lightingCue);
                    setCueSourceInfo(sourceInfo);
                } catch (error) {
                    console.error('Error fetching cue source info:', error);
                    setCueSourceInfo(null);
                }
            } else {
                setCueSourceInfo(null);
            }
        };

        fetchCueSourceInfo();
    }, [currentCueData?.lightingCue]);

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

    // Listen for cue events
    useEffect(() => {
        // Tell the main process to start sending cue data
        window.electron.ipcRenderer.send('set-listen-cue-data', true);

        const handleCueData = (_: unknown, cueData: CueData) => {
            console.log('Received cue data:', cueData);

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
                    } else {
                        // IF keyframe is OFF, do nothing, the timer will remove the indicator
                    }
                }

                // Update our ref with the current keyframe value
                prevKeyframeRef.current = cueData.keyframe;
            }

            setCurrentCueData(cueData);
        };

        // Add the listener for handled cues
        addIpcListener('cue-handled', handleCueData);

        return () => {
            // Tell the main process to stop sending cue data
            window.electron.ipcRenderer.send('set-listen-cue-data', false);

            // Clean up
            removeIpcListener('cue-handled', handleCueData);
        };
    }, []);

    const getTitle = () => {
        if (cueSourceInfo?.groupName) {
            return `Current Cue (${cueSourceInfo.groupName}${cueSourceInfo.isFromDefault ? ' - fallback' : ''})`;
        }
        return 'Current Cue';
    };

    return (
        <div className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
            <h3 className="text-lg font-semibold mb-2">{getTitle()}</h3>
            {currentCueData ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <p className="font-medium">Name:</p>
                        <p>{currentCueData.lightingCue || 'None'}</p>
                    </div>

                    <div>
                                <p className="font-medium">Strobe State:</p>
                                <p>{currentCueData.strobeState || 'None'}</p>
                            </div>

                    {/* Measure/Beat counter */}
                    <div>
                                <p className="font-medium">BPM:</p>
                                <p>{currentCueData.beatsPerMinute}</p>
                            </div>
                    {currentCueData.measureOrBeat !== undefined && (
                        <div>
                            <p className="font-medium">Current Measure:</p>
                            <p>Measure {currentCueData.measureOrBeat}</p>
                        </div>
                    )}
                    {currentCueData.platform !== "RB3E" &&
                        <>
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


                          
                        </>
                    }

                    {currentCueData.platform === "RB3E" &&
                        <div className="flex items-center gap-2">
                            <p className="font-medium">LED Color:</p>
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-6 h-6 rounded border border-gray-400"
                                    style={{
                                        backgroundColor: currentCueData.ledColor || 'transparent'
                                    }}
                                />
                                <span>{currentCueData.ledColor}</span>
                            </div>
                        </div>
                    }
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400">No active cue</p>
            )}
        </div>
    );
};

export default CuePreview; 