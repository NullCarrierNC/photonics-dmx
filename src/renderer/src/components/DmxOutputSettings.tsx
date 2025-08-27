import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { 
  senderArtNetEnabledAtom, 
  senderSacnEnabledAtom,
  senderEnttecProEnabledAtom,
  artNetConfigAtom,
  enttecProComPortAtom,
  lightingPrefsAtom,
  dmxSettingsPrefsAtom,
  dmxOutputPrefsAtom
} from '../atoms';

const DmxOutputSettings: React.FC = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [artNetConfig, setArtNetConfig] = useAtom(artNetConfigAtom);
  const [comPort, setComPort] = useAtom(enttecProComPortAtom);
  const [prefs] = useAtom(lightingPrefsAtom);
  const [dmxSettingsPrefs, setDmxSettingsPrefs] = useAtom(dmxSettingsPrefsAtom);
  const [dmxOutputPrefs, setDmxOutputPrefs] = useAtom(dmxOutputPrefsAtom);

  const [artNetExpanded, setArtNetExpanded] = useState(false);
  const [enttecProExpanded, setEnttecProExpanded] = useState(false);

  // Load other preferences (ArtNet config, COM port, etc.)
  useEffect(() => {
    console.log('Loading other preferences');
    
    if (prefs.artNetConfig) {
      setArtNetConfig(prev => ({
        ...prev,
        ...prefs.artNetConfig
      }));
    }
    if (prefs.enttecProPort) {
      setComPort(prefs.enttecProPort);
    }
    if (prefs.dmxSettingsPrefs) {
      setDmxSettingsPrefs(prev => ({
        ...prev,
        ...prefs.dmxSettingsPrefs
      }));
    }
  }, [prefs, setArtNetConfig, setComPort, setDmxSettingsPrefs]);

  // Load DMX output configuration independently
  useEffect(() => {
    console.log('Checking DMX output configuration state');
    console.log('Current dmxOutputPrefs:', dmxOutputPrefs);
    console.log('Preferences dmxOutputConfig:', prefs.dmxOutputConfig);
    
    // Check if the atom is in its default state (all false)
    const isDefaultState = dmxOutputPrefs.sacnEnabled === false && 
                          dmxOutputPrefs.artNetEnabled === false && 
                          dmxOutputPrefs.enttecProEnabled === false;
    
    if (isDefaultState) {
      console.log('Atom is in default state, loading from preferences or initializing');
      
      // Try to load from preferences first
      if (prefs.dmxOutputConfig) {
        console.log('Loading dmxOutputConfig from preferences:', prefs.dmxOutputConfig);
        setDmxOutputPrefs(prefs.dmxOutputConfig);
      } else {
        // Initialize from current sender states
        const initialConfig = {
          sacnEnabled: isSacnEnabled,
          artNetEnabled: isArtNetEnabled,
          enttecProEnabled: isEnttecProEnabled
        };
        
        console.log('Initializing dmxOutputPrefs from sender states:', initialConfig);
        setDmxOutputPrefs(initialConfig);
        
        // Save the initial configuration to preferences
        window.electron.ipcRenderer.invoke('save-prefs', {
          dmxOutputConfig: initialConfig
        }).catch(error => {
          console.error('Failed to save initial DMX output configuration:', error);
        });
      }
    } else {
      console.log('Atom already has state, not reloading from preferences');
    }
  }, [prefs.dmxOutputConfig, isSacnEnabled, isArtNetEnabled, isEnttecProEnabled, setDmxOutputPrefs, dmxOutputPrefs]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('dmxOutputPrefs changed:', dmxOutputPrefs);
  }, [dmxOutputPrefs]);

  // Debug logging for preferences loading
  useEffect(() => {
    console.log('Preferences loaded');
  }, [prefs]);

  const handleSacnToggle = async () => {
    console.log('sACN toggle clicked, current state:', dmxOutputPrefs.sacnEnabled);
    const newState = !dmxOutputPrefs.sacnEnabled;
    const newConfig = {
      ...dmxOutputPrefs,
      sacnEnabled: newState
    };
    
    console.log('Setting new config:', newConfig);
    
    // Update the local atom state
    setDmxOutputPrefs(newConfig);
    
    // If disabling sACN, stop the sender if it's running and turn off the toggle
    if (!newState && isSacnEnabled) {
      console.log('Disabling sACN checkbox - stopping sACN sender and turning off toggle');
      window.electron.ipcRenderer.send('sender-disable', { sender: 'sacn' });
      setIsSacnEnabled(false); // Turn off the toggle state
    }
    
    try {
      const result = await window.electron.ipcRenderer.invoke('save-prefs', {
        dmxOutputConfig: newConfig
      });
      console.log('Save result:', result);
    } catch (error) {
      console.error('Failed to save DMX output configuration:', error);
    }
  };

  const handleArtNetToggle = async () => {
    console.log('ArtNet toggle clicked, current state:', dmxOutputPrefs.artNetEnabled);
    const newState = !dmxOutputPrefs.artNetEnabled;
    const newConfig = {
      ...dmxOutputPrefs,
      artNetEnabled: newState
    };
    
    console.log('Setting new config:', newConfig);
    
    // Update the local atom state
    setDmxOutputPrefs(newConfig);
    
    // If disabling ArtNet, stop the sender if it's running and turn off the toggle
    if (!newState && isArtNetEnabled) {
      console.log('Disabling ArtNet checkbox - stopping ArtNet sender and turning off toggle');
      window.electron.ipcRenderer.send('sender-disable', { sender: 'artnet' });
      setIsArtNetEnabled(false); // Turn off the toggle state
    }
    
    try {
      const result = await window.electron.ipcRenderer.invoke('save-prefs', {
        dmxOutputConfig: newConfig
      });
      console.log('Save result:', result);
    } catch (error) {
      console.error('Failed to save DMX output configuration:', error);
    }
  };

  const handleEnttecProToggle = async () => {
    console.log('Enttec Pro toggle clicked, current state:', dmxOutputPrefs.enttecProEnabled);
    const newState = !dmxOutputPrefs.enttecProEnabled;
    const newConfig = {
      ...dmxOutputPrefs,
      enttecProEnabled: newState
    };
    
    console.log('Setting new config:', newConfig);
    
    // Update the local atom state
    setDmxOutputPrefs(newConfig);
    
    // If disabling Enttec Pro, stop the sender if it's running and turn off the toggle
    if (!newState && isEnttecProEnabled) {
      console.log('Disabling Enttec Pro checkbox - stopping Enttec Pro sender and turning off toggle');
      window.electron.ipcRenderer.send('sender-disable', { sender: 'enttecpro' });
      setIsEnttecProEnabled(false); // Turn off the toggle state
    }
    
    try {
      const result = await window.electron.ipcRenderer.invoke('save-prefs', {
        dmxOutputConfig: newConfig
      });
      console.log('Save result:', result);
    } catch (error) {
      console.error('Failed to save DMX output configuration:', error);
    }
  };

  const handleArtNetConfigChange = async (field: keyof typeof artNetConfig, value: string | number) => {
    const newConfig = {
      ...artNetConfig,
      [field]: typeof value === 'string' ? value : value
    };
    
    setArtNetConfig(newConfig);
    
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        artNetConfig: newConfig
      });
    } catch (error) {
      console.error('Failed to save ArtNet configuration:', error);
    }
  };

  const handleComPortChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value;
    setComPort(newPort);
    
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        enttecProPort: newPort
      });
    } catch (error) {
      console.error('Failed to save EnttecPro port configuration:', error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-900 dark:text-white border-gray-200 dark:border-gray-600">
        DMX Output Configuration
      </h2>
      
      {/* Enabled Modes */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Enabled Modes</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Select the DMX modes you want to use. This will make them available for use.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          sACN doesn't require any configuration. ArtNet requires you to configure the ArtNet settings below.<br/>EnttecPro requires you to configure the COM port below.
        </p>
        <div className="flex items-center space-x-6">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={dmxOutputPrefs.sacnEnabled}
              onChange={handleSacnToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">sACN</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={dmxOutputPrefs.artNetEnabled}
              onChange={handleArtNetToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ArtNet</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={dmxOutputPrefs.enttecProEnabled}
              onChange={handleEnttecProToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enttec Pro USB</span>
          </label>
        </div>
      </div>

      {/* ArtNet Configuration */}
      <div className="mb-6">
        <div className="border rounded-lg border-gray-200 dark:border-gray-600">
          <div 
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => setArtNetExpanded(!artNetExpanded)}
          >
            <div className="flex items-center flex-1">
              <div className="mr-3 text-gray-600 dark:text-gray-400">
                {artNetExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">ArtNet Configuration</h3>
            </div>
          </div>

          {artNetExpanded && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mb-4">
                  ArtNet requires you to specify the host IP address of the ArtNet device you are using.
                <br/>
                  Net, subnet, universe, and sub universe are usually 0 unless you've modified them. The default port is 6454.
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Host:</label>
                  <input
                    type="text"
                    value={artNetConfig.host}
                    onChange={(e) => handleArtNetConfigChange('host', e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="127.0.0.1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Net:</label>
                    <input
                      type="number"
                      value={artNetConfig.net}
                      onChange={(e) => handleArtNetConfigChange('net', parseInt(e.target.value) || 0)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="0"
                      max="255"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Subnet:</label>
                    <input
                      type="number"
                      value={artNetConfig.subnet}
                      onChange={(e) => handleArtNetConfigChange('subnet', parseInt(e.target.value) || 0)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="0"
                      max="255"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Universe:</label>
                    <input
                      type="number"
                      value={artNetConfig.universe}
                      onChange={(e) => handleArtNetConfigChange('universe', parseInt(e.target.value) || 0)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="0"
                      max="255"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Sub Universe:</label>
                    <input
                      type="number"
                      value={artNetConfig.subuni}
                      onChange={(e) => handleArtNetConfigChange('subuni', parseInt(e.target.value) || 0)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="0"
                      max="255"
                    />
                  </div>
                  
                  
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Port:</label>
                  <input
                    type="number"
                    value={artNetConfig.port}
                    onChange={(e) => handleArtNetConfigChange('port', parseInt(e.target.value) || 6454)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="1024"
                    max="65535"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enttec Pro USB Configuration */}
      <div>
        <div className="border rounded-lg border-gray-200 dark:border-gray-600">
          <div 
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => setEnttecProExpanded(!enttecProExpanded)}
          >
            <div className="flex items-center flex-1">
              <div className="mr-3 text-gray-600 dark:text-gray-400">
                {enttecProExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Enttec Pro USB Configuration</h3>
            </div>
          </div>

          {enttecProExpanded && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">COM:</label>
                  <input
                    type="text"
                    value={comPort}
                    onChange={handleComPortChange}
                    className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="COM3"
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mt-4">
                  Enter the COM port of your Enttec Pro USB DMX interface. 
                  <br/>On PC this is usually COM3, COM4, etc. 
                  <br/>On Mac it is usually something like /dev/tty.usbserial-A9000001.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DmxOutputSettings;
