import React, { useState, useEffect } from 'react';
import { CueData } from '../../../photonics-dmx/cues/cueTypes';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import { useAtom } from 'jotai';
import { rb3eListenerEnabledAtom } from '../atoms';

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
    const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom);

    // Listen for cue events when RB3E listener is enabled
    useEffect(() => {
        if (!rb3eListenerEnabled) {
            // Clear data when listener is disabled
            setCurrentCueData(null);
            setColorBanks({
                red: [],
                green: [],
                blue: [],
                yellow: []
            });
            return;
        }

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
    }, [rb3eListenerEnabled]);

    const getTitle = () => {
        return 'RB3E StageKit Status';
    };

    const renderLedPositions = () => {
        return (
            <div className="space-y-4">
                {/* Color Bank Rows - Always Visible */}
                <div className="space-y-2">
                    {(['red', 'green', 'blue', 'yellow'] as const).map(color => {
                        const positions = colorBanks[color];
                        const isActive = positions.length > 0;
                        const colorConfig = {
                            red: { 
                                bg: 'bg-[#ff0000]', 
                                border: 'border-[#cc0000]', 
                                text: 'text-white',
                                inactiveBg: 'bg-red-950',
                                inactiveBorder: 'border-red-950',
                                inactiveText: 'text-red-400'
                            },
                            green: { 
                                bg: 'bg-[#00ff00]', 
                                border: 'border-[#00cc00]', 
                                text: 'text-black',
                                inactiveBg: 'bg-green-950',
                                inactiveBorder: 'border-green-950',
                                inactiveText: 'text-green-400'
                            },
                            blue: { 
                                bg: 'bg-[#0000ff]', 
                                border: 'border-[#0000cc]', 
                                text: 'text-white',
                                inactiveBg: 'bg-blue-950',
                                inactiveBorder: 'border-blue-950',
                                inactiveText: 'text-blue-400'
                            },
                            yellow: { 
                                bg: 'bg-[#ffff00]', 
                                border: 'border-[#cccc00]', 
                                text: 'text-black',
                                inactiveBg: 'bg-yellow-950',
                                inactiveBorder: 'border-yellow-950',
                                inactiveText: 'text-yellow-300'
                            }
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
                                                            : `${config.inactiveBg} ${config.inactiveBorder} ${config.inactiveText}`
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

                {/* Horizontal separator */}
                <hr className="border-gray-600 dark:border-gray-500 my-2" />

                {/* Blended Color Row */}
                <div className="space-y-2">
                    <div className="flex items-center space-x-4">
                        <div className="w-20">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Blended
                            </span>
                        </div>
                        <div className="flex-1">
                            <div className="grid grid-cols-8 gap-1">
                                {Array.from({ length: 8 }, (_, i) => {
                                    // Calculate which colors are active for this LED position
                                    const activeColors = ['red', 'green', 'blue', 'yellow'].filter(color => 
                                        colorBanks[color as keyof ColorBankState].includes(i)
                                    );
                                    
                                    const isBlended = activeColors.length > 0;
                                    let blendedText = 'text-gray-400';
                                    let blendColor = 'rgb(0, 0, 0)';
                                    let darkerBlendColor = 'rgb(0, 0, 0)';
                                    
                                    if (isBlended) {
                                        if (activeColors.length === 1) {
                                            // Single color - use that color
                                            const color = activeColors[0];
                                            const colorConfig = {
                                                red: { color: 'rgb(255, 0, 0)', border: 'rgb(204, 0, 0)', text: 'text-white' },
                                                green: { color: 'rgb(0, 255, 0)', border: 'rgb(0, 204, 0)', text: 'text-black' },
                                                blue: { color: 'rgb(0, 0, 255)', border: 'rgb(0, 0, 204)', text: 'text-white' },
                                                yellow: { color: 'rgb(255, 255, 0)', border: 'rgb(204, 204, 0)', text: 'text-black' }
                                            };
                                            blendColor = colorConfig[color as keyof typeof colorConfig].color;
                                            darkerBlendColor = colorConfig[color as keyof typeof colorConfig].border;
                                            blendedText = colorConfig[color as keyof typeof colorConfig].text;
                                        } else {
                                            // Multiple colors - calculate actual additive blend
                                            let r = 0, g = 0, b = 0;
                                            
                                            if (activeColors.includes('red')) r = 255;
                                            if (activeColors.includes('green')) g = 255;
                                            if (activeColors.includes('blue')) b = 255;
                                            if (activeColors.includes('yellow')) { r = 255; g = 255; }
                                            
                                            // Create custom CSS color for the blend
                                            blendColor = `rgb(${r}, ${g}, ${b})`;
                                            darkerBlendColor = `rgb(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.8)}, ${Math.floor(b * 0.8)})`;
                                            
                                            blendedText = r + g + b > 255 ? 'text-black' : 'text-white';
                                        }
                                    }
                                    
                                    return (
                                        <div
                                            key={i}
                                            className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold ${blendedText}`}
                                            style={{
                                                backgroundColor: isBlended ? blendColor : 'rgb(17, 24, 39)', // bg-gray-950
                                                borderColor: isBlended ? darkerBlendColor : 'rgb(17, 24, 39)' // bg-gray-950
                                            }}
                                        >
                                            {i + 1}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="w-16 text-right">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Blended
                            </span>
                        </div>
                    </div>
                </div>
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
                                <div className={`w-16 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                    currentCueData.strobeState && currentCueData.strobeState !== 'Strobe_Off'
                                        ? 'bg-white border-gray-300 text-black' 
                                        : 'bg-gray-800 border-gray-600 text-white'
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
