import React, { useState, useEffect } from 'react';
import { CueData } from '../../../photonics-dmx/cues/cueTypes';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';

interface CuePreviewRb3eProps {
    className?: string;
}

interface ColorBankState {
    red: number[];
    green: number[];
    blue: number[];
    yellow: number[];
}

const CuePreviewRb3e: React.FC<CuePreviewRb3eProps> = ({
    className = ''
}) => {
    const [currentCueData, setCurrentCueData] = useState<CueData | null>(null);
    const [colorBanks, setColorBanks] = useState<ColorBankState>({
        red: [],
        green: [],
        blue: [],
        yellow: []
    });

    // Listen for cue events
    useEffect(() => {
        // Tell the main process to start sending cue data
        window.electron.ipcRenderer.send('set-listen-cue-data', true);

        const handleCueData = (_: unknown, cueData: CueData) => {
            console.log('Received RB3E cue data:', cueData);

            // Update color banks based on LED positions
            if (cueData.ledPositions !== undefined && cueData.ledColor) {
                const color = cueData.ledColor.toLowerCase();
                if (color === 'red' || color === 'green' || color === 'blue' || color === 'yellow') {
                    // If positions array is empty, clear the color bank
                    // If positions array has values, update the color bank
                    setColorBanks(prev => ({
                        ...prev,
                        [color]: cueData.ledPositions || []
                    }));
                }
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
        return 'RB3E StageKit Status';
    };

    const renderLedPositions = () => {
        return (
            <div className="space-y-4">
                {/* Color Bank Rows - Always Visible */}
                <div className="space-y-3">
                    {(['red', 'green', 'blue', 'yellow'] as const).map(color => {
                        const positions = colorBanks[color];
                        const isActive = positions.length > 0;
                        const colorConfig = {
                            red: { bg: 'bg-red-500', border: 'border-red-600', text: 'text-red-900' },
                            green: { bg: 'bg-green-500', border: 'border-green-600', text: 'text-green-900' },
                            blue: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-blue-900' },
                            yellow: { bg: 'bg-yellow-400', border: 'border-yellow-500', text: 'text-yellow-900' }
                        };
                        const config = colorConfig[color];

                        return (
                            <div key={color} className="flex items-center space-x-4">
                                <div className="w-20">
                                    <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                                        {color}
                                    </span>
                                </div>
                                <div className="flex-1">
                                    <div className="grid grid-cols-8 gap-1">
                                        {Array.from({ length: 8 }, (_, i) => {
                                            const isLit = positions.includes(i);
                                            return (
                                                <div
                                                    key={i}
                                                    className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold ${
                                                        isLit 
                                                            ? `${config.bg} ${config.border} ${config.text}` 
                                                            : 'bg-gray-200 border-gray-300 text-gray-400'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="w-16 text-right">
                                    <span className={`text-xs ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {isActive ? `${positions.length} active` : 'inactive'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Current LED Positions Summary - REMOVED */}
            </div>
        );
    };

    return (
        <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
            <h3 className="text-lg font-semibold mb-3">{getTitle()}</h3>
            
            {currentCueData ? (
                <div className="space-y-6">
                    {/* LED Position Display */}
                    <div>
                        <h4 className="text-md font-medium mb-3 text-gray-700 dark:text-gray-300">
                            LED Position Mapping
                        </h4>
                        {renderLedPositions()}
                    </div>

                    {/* Additional RB3E Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="font-medium text-gray-700 dark:text-gray-300">Venue Size:</p>
                            <p className="text-gray-600 dark:text-gray-400">{currentCueData.venueSize}</p>
                        </div>
                        <div>
                            <p className="font-medium text-gray-700 dark:text-gray-300">Strobe State:</p>
                            <div className="flex items-center space-x-2">
                                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                    currentCueData.strobeState && currentCueData.strobeState !== 'Strobe_Off'
                                        ? 'bg-yellow-400 border-yellow-600 text-yellow-900' 
                                        : 'bg-gray-300 border-gray-400 text-gray-600'
                                }`}>
                                    {currentCueData.strobeState === 'Strobe_Off' ? 'OFF' : 'ON'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400">No active RB3E data</p>
            )}
        </div>
    );
};

export default CuePreviewRb3e;
