import React, { useState, useEffect } from 'react';
import { CueData } from '../../../photonics-dmx/cues/cueTypes';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import { useAtom } from 'jotai';
import { yargListenerEnabledAtom, rb3eListenerEnabledAtom } from '../atoms';
import CuePreviewYarg from './CuePreviewYarg';
import CuePreviewRb3e from './CuePreviewRb3e';

interface CuePreviewProps {
    className?: string;
    showBeatIndicator?: boolean;
    showMeasureIndicator?: boolean;
    showKeyframeIndicator?: boolean;
    manualBeatType?: string;
    manualMeasureType?: string;
    manualKeyframeType?: string;
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
    const [platform, setPlatform] = useState<'RB3E' | 'YARG' | null>(null);
    const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom);
    const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom);

    // Clear states when listeners are disabled
    useEffect(() => {
        if (!yargListenerEnabled && !rb3eListenerEnabled) {
            setPlatform(null);
            setCurrentCueData(null);
        }
    }, [yargListenerEnabled, rb3eListenerEnabled]);

    // Listen for cue events to determine platform
    useEffect(() => {
        // Tell the main process to start sending cue data
        window.electron.ipcRenderer.send('set-listen-cue-data', true);

        const handleCueData = (_: unknown, cueData: CueData) => {
            console.log('Received cue data in main CuePreview:', cueData);
            
            // Determine platform from cue data
            if (cueData.platform === 'RB3E') {
                setPlatform('RB3E');
            } else if (cueData.platform === 'Windows' || cueData.platform === 'Linux' || cueData.platform === 'Mac') {
                setPlatform('YARG');
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

    // Render the appropriate component based on platform
    if (platform === 'RB3E') {
        return <CuePreviewRb3e className={className} />;
    } else if (platform === 'YARG') {
        return (
            <CuePreviewYarg
                className={className}
                showBeatIndicator={showBeatIndicator}
                showMeasureIndicator={showMeasureIndicator}
                showKeyframeIndicator={showKeyframeIndicator}
                manualBeatType={manualBeatType}
                manualMeasureType={manualMeasureType}
                manualKeyframeType={manualKeyframeType}
            />
        );
    }

    // Default state when no platform is detected yet
    return (
        <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
            <h3 className="text-lg font-semibold mb-1">Cue Preview</h3>
            <p className="text-gray-500 dark:text-gray-400">
                {currentCueData ? 'Detecting platform...' : 'Waiting for cue data...'}
            </p>
        </div>
    );
};

export default CuePreview; 