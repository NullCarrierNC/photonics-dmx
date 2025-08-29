import React, { useState, useEffect } from 'react';
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
    const [platform, setPlatform] = useState<'RB3E' | 'YARG' | null>(null);
    const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom);
    const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom);

    // Update platform when listeners change
    useEffect(() => {
        if (rb3eListenerEnabled) {
            setPlatform('RB3E');
        } else if (yargListenerEnabled) {
            setPlatform('YARG');
        } else {
            setPlatform(null);
        }
    }, [rb3eListenerEnabled, yargListenerEnabled]);

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
                {platform === null ? 'You must enable YARG or RB3E' : 'Waiting for cue data...'}
            </p>
        </div>
    );
};

export default CuePreview; 