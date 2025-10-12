import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  senderArtNetEnabledAtom,
  senderSacnEnabledAtom,
  senderEnttecProEnabledAtom,
  artNetConfigAtom,
  sacnConfigAtom,
  enttecProComPortAtom,
  lightingPrefsAtom
} from '../atoms';

const DmxOutputSettings: React.FC = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [artNetConfig] = useAtom(artNetConfigAtom);
  const [sacnConfig] = useAtom(sacnConfigAtom);
  const [comPort, setComPort] = useAtom(enttecProComPortAtom);
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom);

  const [artNetExpanded, setArtNetExpanded] = useState(false);
  const [sacnExpanded, setSacnExpanded] = useState(false);
  const [enttecProExpanded, setEnttecProExpanded] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<Array<{name: string, value: string, family: string}>>([]);

  // Load other preferences (ArtNet config, COM port, etc.)
  useEffect(() => {
    console.log('Loading other preferences');

    if (prefs.enttecProPort) {
      setComPort(prefs.enttecProPort);
    }

    // Load DMX settings UI preferences
    if (prefs.dmxSettingsPrefs) {
      setArtNetExpanded(prefs.dmxSettingsPrefs.artNetExpanded || false);
      setSacnExpanded(prefs.dmxSettingsPrefs.sacnExpanded || false);
      setEnttecProExpanded(prefs.dmxSettingsPrefs.enttecProExpanded || false);
    }

  }, [prefs, setComPort]);

  // Load network interfaces for sACN configuration
  useEffect(() => {
    const loadNetworkInterfaces = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('get-network-interfaces');
        if (result.success) {
          setNetworkInterfaces(result.interfaces);
        } else {
          console.error('Failed to load network interfaces:', result.error);
        }
      } catch (error) {
        console.error('Error loading network interfaces:', error);
      }
    };

    loadNetworkInterfaces();
  }, []);

  // Load DMX output configuration independently
  useEffect(() => {
    console.log('Checking DMX output configuration state');
    console.log('Preferences dmxOutputConfig:', prefs.dmxOutputConfig);
    
    // Check if preferences need to be initialized
    if (!prefs.dmxOutputConfig) {
      console.log('No DMX output config in preferences, initializing from sender states');
      
      // Initialize from current sender states
      const initialConfig = {
        sacnEnabled: isSacnEnabled,
        artNetEnabled: isArtNetEnabled,
        enttecProEnabled: isEnttecProEnabled
      };
      
      console.log('Initializing dmxOutputConfig from sender states:', initialConfig);
      
      // Save the initial configuration to preferences
      setPrefs(prev => ({
        ...prev,
        dmxOutputConfig: initialConfig
      }));
      
      window.electron.ipcRenderer.invoke('save-prefs', {
        dmxOutputConfig: initialConfig
      }).catch(error => {
        console.error('Failed to save initial DMX output configuration:', error);
      });
    }
  }, [prefs.dmxOutputConfig, isSacnEnabled, isArtNetEnabled, isEnttecProEnabled, setPrefs]);



  const handleSacnToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.sacnEnabled || false;
    console.log('sACN toggle clicked, current state:', currentState);
    const newState = !currentState;
    const newConfig = {
      ...prefs.dmxOutputConfig,
      sacnEnabled: newState,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false
    };

   
    // Update the global preferences
    setPrefs(prev => ({
      ...prev,
      dmxOutputConfig: newConfig
    }));

    // If enabling sACN, start the sender
    if (newState && !isSacnEnabled) {
      window.electron.ipcRenderer.send('sender-enable', {
        sender: 'sacn',
        ...sacnConfig
      });
      setIsSacnEnabled(true); // Turn on the toggle state
    }

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
    const currentState = prefs.dmxOutputConfig?.artNetEnabled || false;
    console.log('ArtNet toggle clicked, current state:', currentState);
    const newState = !currentState;
    const newConfig = {
      ...prefs.dmxOutputConfig,
      artNetEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false
    };

    console.log('Setting new config:', newConfig);

    // Update the global preferences
    setPrefs(prev => ({
      ...prev,
      dmxOutputConfig: newConfig
    }));

    // If enabling ArtNet, start the sender
    if (newState && !isArtNetEnabled) {
      console.log('Enabling ArtNet checkbox - starting ArtNet sender');
      window.electron.ipcRenderer.send('sender-enable', {
        sender: 'artnet',
        ...artNetConfig
      });
      setIsArtNetEnabled(true); // Turn on the toggle state
    }

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
    const currentState = prefs.dmxOutputConfig?.enttecProEnabled || false;
    console.log('Enttec Pro toggle clicked, current state:', currentState);
    const newState = !currentState;
    const newConfig = {
      ...prefs.dmxOutputConfig,
      enttecProEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false
    };

    console.log('Setting new config:', newConfig);

    // Update the global preferences
    setPrefs(prev => ({
      ...prev,
      dmxOutputConfig: newConfig
    }));

    // If enabling Enttec Pro, start the sender
    if (newState && !isEnttecProEnabled) {
      console.log('Enabling Enttec Pro checkbox - starting Enttec Pro sender');
      window.electron.ipcRenderer.send('sender-enable', {
        sender: 'enttecpro',
        port: comPort
      });
      setIsEnttecProEnabled(true); // Turn on the toggle state
    }

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

    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        artNetConfig: newConfig
      });

      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        artNetConfig: newConfig
      }));
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

      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        enttecProPort: newPort
      }));
    } catch (error) {
      console.error('Failed to save EnttecPro port configuration:', error);
    }
  };

  const handleSacnConfigChange = async (field: keyof typeof sacnConfig, value: string | number | boolean) => {
    const newConfig = {
      ...sacnConfig,
      [field]: value
    };

    try {
      // Save to preferences
      await window.electron.ipcRenderer.invoke('save-prefs', {
        sacnConfig: newConfig
      });

      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        sacnConfig: newConfig
      }));

      // Update the running sender if sACN is enabled
      if (isSacnEnabled) {
        await window.electron.ipcRenderer.invoke('update-sacn-config', newConfig);
      }
    } catch (error) {
      console.error('Failed to save sACN configuration:', error);
    }
  };

  // Save expanded state changes
  const saveExpandedStates = async (artNet: boolean, sacn: boolean, enttecPro: boolean) => {
    const newDmxSettingsPrefs = {
      artNetExpanded: artNet,
      sacnExpanded: sacn,
      enttecProExpanded: enttecPro
    };

    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        dmxSettingsPrefs: newDmxSettingsPrefs
      });

      setPrefs(prev => ({
        ...prev,
        dmxSettingsPrefs: newDmxSettingsPrefs
      }));
    } catch (error) {
      console.error('Failed to save DMX settings preferences:', error);
    }
  };


  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        DMX Output Configuration
      </h2>
      
      {/* Enabled Modes */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Enabled DMX Output Modes</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Select the DMX modes you want to use. This will make them available for use in Game Settings on the Status page.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
         Each sender can be configured individually below.
        </p>
        <div className="flex items-center space-x-6">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={prefs.dmxOutputConfig?.sacnEnabled || false}
              onChange={handleSacnToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">sACN</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={prefs.dmxOutputConfig?.artNetEnabled || false}
              onChange={handleArtNetToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ArtNet</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={prefs.dmxOutputConfig?.enttecProEnabled || false}
              onChange={handleEnttecProToggle}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enttec Pro USB</span>
          </label>
        </div>
      </div>

      {/* sACN Configuration */}
      {prefs.dmxOutputConfig?.sacnEnabled && (
        <div className="mb-6">
          <div className="border rounded-lg border-gray-200 dark:border-gray-600">
          <div
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => {
              const newSacnExpanded = !sacnExpanded;
              setSacnExpanded(newSacnExpanded);
              saveExpandedStates(artNetExpanded, newSacnExpanded, enttecProExpanded);
            }}
          >
            <div className="flex items-center flex-1">
              <div className="mr-3 text-gray-600 dark:text-gray-400">
                {sacnExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">sACN Configuration</h3>
            </div>
          </div>

          {sacnExpanded && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure sACN network settings. By default, sACN broadcasts to the entire network. You can specify a network interface or unicast destination for specific targeting.
                </p>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24">Universe:</label>
                    <input
                      type="number"
                      value={sacnConfig.universe}
                      onChange={(e) => handleSacnConfigChange('universe', parseInt(e.target.value) || 1)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="1"
                      max="63999"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24">Network Interface:</label>
                    <select
                      value={sacnConfig.networkInterface || ""}
                      onChange={(e) => handleSacnConfigChange('networkInterface', e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Auto-detect (recommended)</option>
                      {networkInterfaces.map((iface) => (
                        <option key={iface.value} value={iface.value}>
                          {iface.name} ({iface.family})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="sacn-unicast"
                        checked={sacnConfig.useUnicast}
                        onChange={(e) => handleSacnConfigChange('useUnicast', e.target.checked)}
                        className="form-checkbox h-4 w-4 text-blue-600 rounded"
                      />
                      <label htmlFor="sacn-unicast" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Use Unicast Destination
                      </label>
                    </div>

                    {sacnConfig.useUnicast && (
                      <div className="flex items-center gap-2 ml-6">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24">Destination IP:</label>
                        <input
                          type="text"
                          value={sacnConfig.unicastDestination}
                          onChange={(e) => handleSacnConfigChange('unicastDestination', e.target.value)}
                          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-48 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="192.168.1.100"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* ArtNet Configuration */}
      {prefs.dmxOutputConfig?.artNetEnabled && (
        <div className="mb-6">
          <div className="border rounded-lg border-gray-200 dark:border-gray-600">
          <div 
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => {
              const newArtNetExpanded = !artNetExpanded;
              setArtNetExpanded(newArtNetExpanded);
              saveExpandedStates(newArtNetExpanded, sacnExpanded, enttecProExpanded);
            }}
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
      )}

      {/* Enttec Pro USB Configuration */}
      {prefs.dmxOutputConfig?.enttecProEnabled && (
        <div>
          <div className="border rounded-lg border-gray-200 dark:border-gray-600">
          <div 
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            onClick={() => {
              const newEnttecProExpanded = !enttecProExpanded;
              setEnttecProExpanded(newEnttecProExpanded);
              saveExpandedStates(artNetExpanded, sacnExpanded, newEnttecProExpanded);
            }}
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
      )}
    </div>
  );
};

export default DmxOutputSettings;
