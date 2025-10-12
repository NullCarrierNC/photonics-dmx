import React from 'react';
import { useAtom } from 'jotai';
import { 
  yargListenerEnabledAtom, 
  rb3eListenerEnabledAtom, 
  lightingPrefsAtom,
  senderSacnEnabledAtom,
  senderArtNetEnabledAtom,
  senderEnttecProEnabledAtom
} from '../atoms';

const StatusBar: React.FC = () => {
  const [isYargEnabled] = useAtom(yargListenerEnabledAtom);
  const [isRb3Enabled] = useAtom(rb3eListenerEnabledAtom);
  const [isSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [isArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [isEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [prefs] = useAtom(lightingPrefsAtom);

  return (
    <div className="bg-gray-800 text-white px-4 py-2 flex justify-between">
      <div className="flex space-x-4">
        <StatusIndicator 
          label="YARG" 
          isActive={isYargEnabled} 
        />
        <StatusIndicator 
          label="RB3" 
          isActive={isRb3Enabled} 
        />
        <div className="w-1"></div>
        <StatusIndicator 
          label="sACN" 
          isActive={isSacnEnabled}
          isEnabledInPrefs={prefs.dmxOutputConfig?.sacnEnabled || false}
        />
        <StatusIndicator 
          label="ArtNet" 
          isActive={isArtNetEnabled}
          isEnabledInPrefs={prefs.dmxOutputConfig?.artNetEnabled || false}
        />
        <StatusIndicator 
          label="EnttecPro USB" 
          isActive={isEnttecProEnabled}
          isEnabledInPrefs={prefs.dmxOutputConfig?.enttecProEnabled || false}
        />
      </div>
    </div>
  );
};

interface StatusIndicatorProps {
  label: string;
  isActive: boolean;
  isEnabledInPrefs?: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ label, isActive, isEnabledInPrefs = true }) => {
  const state = isEnabledInPrefs ? (isActive ? 'active' : 'inactive') : 'disabled';
  const indicatorClasses = state === 'active' ? 'bg-green-500' : 
                          state === 'inactive' ? 'bg-red-500' : 
                          'bg-gray-400 opacity-50';
  
  return (
    <div className="flex items-center space-x-1">
      <div className={`w-3 h-3 rounded-full ${indicatorClasses}`}></div>
      <span className={state === 'disabled' ? 'opacity-50' : ''}>{label}</span>
    </div>
  );
};

export default StatusBar; 