import { useAtom } from 'jotai';
import { 
  senderArtNetEnabledAtom, 
  artNetConfigAtom,
  lightingPrefsAtom 
} from '../atoms';
import { useEffect } from 'react';

const ArtNetToggle = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [artNetConfig, setArtNetConfig] = useAtom(artNetConfigAtom);
  const [prefs] = useAtom(lightingPrefsAtom);

  const handleToggle = () => {
    const newState = !isArtNetEnabled;
    setIsArtNetEnabled(newState);

    if (newState) {
      window.electron.ipcRenderer.send('sender-enable', { 
        sender: 'artnet', 
        ...artNetConfig
      });
      console.log('ArtNet enabled');
    } else {
      window.electron.ipcRenderer.send('sender-disable', { sender: 'artnet' });
      console.log('ArtNet disabled');
    }
  };

  const handleConfigChange = async (field: keyof typeof artNetConfig, value: string | number) => {
    const newConfig = {
      ...artNetConfig,
      [field]: typeof value === 'string' ? value : value
    };
    
    setArtNetConfig(newConfig);
    
    // Save the updated configuration to preferences
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        artNetConfig: newConfig
      });
    } catch (error) {
      console.error('Failed to save ArtNet configuration:', error);
    }
  };

  useEffect(() => {
    if (prefs.artNetConfig) {
      setArtNetConfig(prev => ({
        ...prev,
        ...prefs.artNetConfig
      }));
    }
  }, [prefs, setArtNetConfig]);

  return (
    <div className="flex flex-col gap-2 mb-4 w-[200px] justify-between">
      <div className="flex items-center gap-4 justify-between">
        <label className="text-lg font-semibold">ArtNet Out</label>
        <button
          onClick={handleToggle}
          disabled={artNetConfig.host.length < 7}
          className={`w-12 h-6 rounded-full transition-colors ${
            isArtNetEnabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div
            className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              isArtNetEnabled ? 'translate-x-6' : 'translate-x-0'
            }`}
          ></div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Host:</label>
        <input
          type="text"
          value={artNetConfig.host}
          onChange={(e) => handleConfigChange('host', e.target.value)}
          className="border rounded px-2 py-1 w-[120px] text-black"
          placeholder="127.0.0.1"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium w-[60px]">Universe:</label>
            <input
              type="number"
              value={artNetConfig.universe}
              onChange={(e) => handleConfigChange('universe', parseInt(e.target.value) || 0)}
              className="border rounded px-2 py-1 w-[60px] text-black"
              min="0"
              max="255"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium w-[60px]">Net:</label>
            <input
              type="number"
              value={artNetConfig.net}
              onChange={(e) => handleConfigChange('net', parseInt(e.target.value) || 0)}
              className="border rounded px-2 py-1 w-[60px] text-black"
              min="0"
              max="255"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium w-[60px]">Subnet:</label>
            <input
              type="number"
              value={artNetConfig.subnet}
              onChange={(e) => handleConfigChange('subnet', parseInt(e.target.value) || 0)}
              className="border rounded px-2 py-1 w-[60px] text-black"
              min="0"
              max="255"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium w-[60px]">Subuni:</label>
            <input
              type="number"
              value={artNetConfig.subuni}
              onChange={(e) => handleConfigChange('subuni', parseInt(e.target.value) || 0)}
              className="border rounded px-2 py-1 w-[60px] text-black"
              min="0"
              max="255"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium w-[60px]">Port:</label>
          <input
            type="number"
            value={artNetConfig.port}
            onChange={(e) => handleConfigChange('port', parseInt(e.target.value) || 6454)}
            className="border rounded px-2 py-1 w-[80px] text-black"
            min="1024"
            max="65535"
          />
        </div>
      </div>
    </div>
  );
};

export default ArtNetToggle; 