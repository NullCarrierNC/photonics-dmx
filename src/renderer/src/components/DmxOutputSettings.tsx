import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  senderArtNetEnabledAtom,
  senderSacnEnabledAtom,
  senderEnttecProEnabledAtom,
  senderOpenDmxEnabledAtom,
  artNetConfigAtom,
  sacnConfigAtom,
  enttecProComPortAtom,
  openDmxComPortAtom,
  lightingPrefsAtom
} from '../atoms';
import CollapsibleSenderCard from './DmxOutputSettings/CollapsibleSenderCard';
import DmxOutputEnabledModes from './DmxOutputSettings/DmxOutputEnabledModes';
import { LIGHT, CONFIG } from '../../../shared/ipcChannels';

const DmxOutputSettings: React.FC = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [isOpenDmxEnabled, setIsOpenDmxEnabled] = useAtom(senderOpenDmxEnabledAtom);
  const [artNetConfig] = useAtom(artNetConfigAtom);
  const [sacnConfig] = useAtom(sacnConfigAtom);
  const [comPort, setComPort] = useAtom(enttecProComPortAtom);
  const [openDmxComPort, setOpenDmxComPort] = useAtom(openDmxComPortAtom);
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom);
  const openDmxSpeed = prefs.openDmxConfig?.dmxSpeed ?? 40;
  const enttecProUniverse = prefs.enttecProConfig?.universe ?? 0;
  const openDmxUniverse = prefs.openDmxConfig?.universe ?? 0;

  const [artNetExpanded, setArtNetExpanded] = useState(false);
  const [sacnExpanded, setSacnExpanded] = useState(false);
  const [enttecProExpanded, setEnttecProExpanded] = useState(false);
  const [openDmxExpanded, setOpenDmxExpanded] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<Array<{ name: string, value: string, family: string }>>([]);

  // Load other preferences (ArtNet config, COM port, etc.)
  useEffect(() => {
    console.log('Loading other preferences');

    setComPort(prefs.enttecProConfig?.port ?? '');
    setOpenDmxComPort(prefs.openDmxConfig?.port ?? '');

    // Load DMX settings UI preferences
    if (prefs.dmxSettingsPrefs) {
      setArtNetExpanded(prefs.dmxSettingsPrefs.artNetExpanded || false);
      setSacnExpanded(prefs.dmxSettingsPrefs.sacnExpanded || false);
      setEnttecProExpanded(prefs.dmxSettingsPrefs.enttecProExpanded || false);
      setOpenDmxExpanded(prefs.dmxSettingsPrefs.openDmxExpanded || false);
    }

  }, [prefs, setComPort, setOpenDmxComPort]);

  // Load network interfaces for sACN configuration
  useEffect(() => {
    const loadNetworkInterfaces = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke(LIGHT.GET_NETWORK_INTERFACES);
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
        enttecProEnabled: isEnttecProEnabled,
        openDmxEnabled: isOpenDmxEnabled
      };

      console.log('Initializing dmxOutputConfig from sender states:', initialConfig);

      // Save the initial configuration to preferences
      setPrefs(prev => ({
        ...prev,
        dmxOutputConfig: initialConfig
      }));

      window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        dmxOutputConfig: initialConfig
      }).catch(error => {
        console.error('Failed to save initial DMX output configuration:', error);
      });
    }
  }, [prefs.dmxOutputConfig, isSacnEnabled, isArtNetEnabled, isEnttecProEnabled, isOpenDmxEnabled, setPrefs]);



  const handleSacnToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.sacnEnabled || false;
    console.log('sACN toggle clicked, current state:', currentState);
    const newState = !currentState;
    const newConfig = {
      ...prefs.dmxOutputConfig,
      sacnEnabled: newState,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false
    };


    // Update the global preferences
    setPrefs(prev => ({
      ...prev,
      dmxOutputConfig: newConfig
    }));

    // If enabling sACN, start the sender
    if (newState && !isSacnEnabled) {
      window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, {
        sender: 'sacn',
        ...sacnConfig
      });
      setIsSacnEnabled(true); // Turn on the toggle state
    }

    // If disabling sACN, stop the sender if it's running and turn off the toggle
    if (!newState && isSacnEnabled) {
      console.log('Disabling sACN checkbox - stopping sACN sender and turning off toggle');
      window.electron.ipcRenderer.send(LIGHT.SENDER_DISABLE, { sender: 'sacn' });
      setIsSacnEnabled(false); // Turn off the toggle state
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
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
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false
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
      window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, {
        sender: 'artnet',
        ...artNetConfig
      });
      setIsArtNetEnabled(true); // Turn on the toggle state
    }

    // If disabling ArtNet, stop the sender if it's running and turn off the toggle
    if (!newState && isArtNetEnabled) {
      console.log('Disabling ArtNet checkbox - stopping ArtNet sender and turning off toggle');
      window.electron.ipcRenderer.send(LIGHT.SENDER_DISABLE, { sender: 'artnet' });
      setIsArtNetEnabled(false); // Turn off the toggle state
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
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
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      openDmxEnabled: prefs.dmxOutputConfig?.openDmxEnabled || false
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
      window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, {
        sender: 'enttecpro',
        port: comPort,
        universe: enttecProUniverse
      });
      setIsEnttecProEnabled(true); // Turn on the toggle state
    }

    // If disabling Enttec Pro, stop the sender if it's running and turn off the toggle
    if (!newState && isEnttecProEnabled) {
      console.log('Disabling Enttec Pro checkbox - stopping Enttec Pro sender and turning off toggle');
      window.electron.ipcRenderer.send(LIGHT.SENDER_DISABLE, { sender: 'enttecpro' });
      setIsEnttecProEnabled(false); // Turn off the toggle state
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        dmxOutputConfig: newConfig
      });
      console.log('Save result:', result);
    } catch (error) {
      console.error('Failed to save DMX output configuration:', error);
    }
  };

  const handleOpenDmxToggle = async () => {
    const currentState = prefs.dmxOutputConfig?.openDmxEnabled || false;
    console.log('OpenDMX toggle clicked, current state:', currentState);
    const newState = !currentState;
    const newConfig = {
      ...prefs.dmxOutputConfig,
      openDmxEnabled: newState,
      sacnEnabled: prefs.dmxOutputConfig?.sacnEnabled || false,
      artNetEnabled: prefs.dmxOutputConfig?.artNetEnabled || false,
      enttecProEnabled: prefs.dmxOutputConfig?.enttecProEnabled || false
    };

    console.log('Setting new config:', newConfig);

    setPrefs(prev => ({
      ...prev,
      dmxOutputConfig: newConfig
    }));

    if (newState && !isOpenDmxEnabled) {
      console.log('Enabling OpenDMX checkbox - starting OpenDMX sender');
      window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, {
        sender: 'opendmx',
        port: openDmxComPort,
        dmxSpeed: openDmxSpeed,
        universe: openDmxUniverse
      });
      setIsOpenDmxEnabled(true);
    }

    if (!newState && isOpenDmxEnabled) {
      console.log('Disabling OpenDMX checkbox - stopping OpenDMX sender and turning off toggle');
      window.electron.ipcRenderer.send(LIGHT.SENDER_DISABLE, { sender: 'opendmx' });
      setIsOpenDmxEnabled(false);
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
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
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
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

    const newConfig = {
      ...(prefs.enttecProConfig ?? { port: '', universe: 0 }),
      port: newPort
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        enttecProConfig: newConfig
      });

      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        enttecProConfig: newConfig
      }));
    } catch (error) {
      console.error('Failed to save EnttecPro port configuration:', error);
    }
  };

  const handleOpenDmxComPortChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value;
    setOpenDmxComPort(newPort);

    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: 40, universe: 0 }),
      port: newPort
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        openDmxConfig: newConfig
      });

      setPrefs(prev => ({
        ...prev,
        openDmxConfig: newConfig
      }));
    } catch (error) {
      console.error('Failed to save OpenDMX port configuration:', error);
    }
  };

  const handleOpenDmxSpeedChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10);
    const sanitized = Number.isFinite(parsed) && parsed > 0 ? Math.min(44, Math.max(1, parsed)) : 40;

    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: 40, universe: 0 }),
      dmxSpeed: sanitized
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        openDmxConfig: newConfig
      });

      setPrefs(prev => ({
        ...prev,
        openDmxConfig: newConfig
      }));
    } catch (error) {
      console.error('Failed to save OpenDMX speed configuration:', error);
    }
  };

  const handleEnttecProUniverseChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUniverse = parseInt(e.target.value) || 0;
    const newConfig = {
      ...(prefs.enttecProConfig ?? { port: '', universe: 0 }),
      universe: newUniverse
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        enttecProConfig: newConfig
      });

      setPrefs(prev => ({
        ...prev,
        enttecProConfig: newConfig
      }));
    } catch (error) {
      console.error('Failed to save EnttecPro universe configuration:', error);
    }
  };

  const handleOpenDmxUniverseChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUniverse = parseInt(e.target.value) || 0;
    const newConfig = {
      ...(prefs.openDmxConfig ?? { port: '', dmxSpeed: 40, universe: 0 }),
      universe: newUniverse
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        openDmxConfig: newConfig
      });

      setPrefs(prev => ({
        ...prev,
        openDmxConfig: newConfig
      }));
    } catch (error) {
      console.error('Failed to save OpenDMX universe configuration:', error);
    }
  };

  const handleSacnConfigChange = async (field: keyof typeof sacnConfig, value: string | number | boolean) => {
    const newConfig = {
      ...sacnConfig,
      [field]: value
    };

    try {
      // Save to preferences
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
        sacnConfig: newConfig
      });

      // Update the preferences atom to reflect the change
      setPrefs(prev => ({
        ...prev,
        sacnConfig: newConfig
      }));

      // Update the running sender if sACN is enabled
      if (isSacnEnabled) {
        await window.electron.ipcRenderer.invoke(LIGHT.UPDATE_SACN_CONFIG, newConfig);
      }
    } catch (error) {
      console.error('Failed to save sACN configuration:', error);
    }
  };

  // Save expanded state changes
  const saveExpandedStates = async (artNet: boolean, sacn: boolean, enttecPro: boolean, openDmx: boolean) => {
    const newDmxSettingsPrefs = {
      artNetExpanded: artNet,
      sacnExpanded: sacn,
      enttecProExpanded: enttecPro,
      openDmxExpanded: openDmx
    };

    try {
      await window.electron.ipcRenderer.invoke(CONFIG.SAVE_PREFS, {
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

      <DmxOutputEnabledModes
        sacnEnabled={prefs.dmxOutputConfig?.sacnEnabled || false}
        onSacnToggle={handleSacnToggle}
        artNetEnabled={prefs.dmxOutputConfig?.artNetEnabled || false}
        onArtNetToggle={handleArtNetToggle}
        enttecProEnabled={prefs.dmxOutputConfig?.enttecProEnabled || false}
        onEnttecProToggle={handleEnttecProToggle}
        openDmxEnabled={prefs.dmxOutputConfig?.openDmxEnabled || false}
        onOpenDmxToggle={handleOpenDmxToggle}
      />

      {prefs.dmxOutputConfig?.sacnEnabled && (
        <div className="mb-6">
          <CollapsibleSenderCard
            title="sACN Configuration"
            expanded={sacnExpanded}
            onToggle={() => {
              const newSacnExpanded = !sacnExpanded;
              setSacnExpanded(newSacnExpanded);
              saveExpandedStates(artNetExpanded, newSacnExpanded, enttecProExpanded, openDmxExpanded);
            }}
          >
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
                        min="0"
                        max="63999"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (sACN universes start at 1)
                      </p>
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
          </CollapsibleSenderCard>
        </div>
      )}

      {prefs.dmxOutputConfig?.artNetEnabled && (
        <div className="mb-6">
          <CollapsibleSenderCard
            title="ArtNet Configuration"
            expanded={artNetExpanded}
            onToggle={() => {
              const newArtNetExpanded = !artNetExpanded;
              setArtNetExpanded(newArtNetExpanded);
              saveExpandedStates(newArtNetExpanded, sacnExpanded, enttecProExpanded, openDmxExpanded);
            }}
          >
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mb-4">
                    ArtNet requires you to specify the host IP address of the ArtNet device you are using.
                    <br />
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (ArtNet universes start at 0)
                      </p>
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
          </CollapsibleSenderCard>
        </div>
      )}

      {prefs.dmxOutputConfig?.enttecProEnabled && (
        <div>
          <CollapsibleSenderCard
            title="Enttec Pro USB Configuration"
            expanded={enttecProExpanded}
            onToggle={() => {
              const newEnttecProExpanded = !enttecProExpanded;
              setEnttecProExpanded(newEnttecProExpanded);
              saveExpandedStates(artNetExpanded, sacnExpanded, newEnttecProExpanded, openDmxExpanded);
            }}
          >
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Universe:</label>
                    <input
                      type="number"
                      value={enttecProUniverse}
                      onChange={handleEnttecProUniverseChange}
                      min={0}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (Enttec Pro universes start at 0)
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mt-4">
                    Enter the COM port of your Enttec Pro USB DMX interface.
                    <br />On PC this is usually COM3, COM4, etc.
                    <br />On Mac it is usually something like /dev/tty.usbserial-A9000001.
                  </p>
                </div>
          </CollapsibleSenderCard>
        </div>
      )}

      {prefs.dmxOutputConfig?.openDmxEnabled && (
        <div className="mt-6">
          <CollapsibleSenderCard
            title="OpenDMX USB Configuration"
            expanded={openDmxExpanded}
            onToggle={() => {
              const newOpenDmxExpanded = !openDmxExpanded;
              setOpenDmxExpanded(newOpenDmxExpanded);
              saveExpandedStates(artNetExpanded, sacnExpanded, enttecProExpanded, newOpenDmxExpanded);
            }}
          >
                <div className="space-y-3">
                  <p className="text-sm text-red-600 dark:text-red-500 ">
                    OpenDMX USB adapters are very poor quality - we <b>HIGHLY</b> recommend against using them!
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-500 ">
                    If you want to use one, please be aware that:
                    <ul className="list-disc list-inside">
                      <li>They are not electrically isolated between DMX and USB. This increases the chances you could damage your computer. </li>
                      <li>You will likely experience DMX drop-outs or other timing issues which will cause flickering.</li>
                      <li>Do NOT use with Moving Heads - drop-outs can cause thrashing of the motors.</li>
                      <li><b>These are fundamental issues with the hardware and not something we can fix.</b></li>
                    </ul>
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">COM:</label>
                    <input
                      type="text"
                      value={openDmxComPort}
                      onChange={handleOpenDmxComPortChange}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="COM4"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Refresh:</label>
                    <input
                      type="number"
                      value={openDmxSpeed}
                      onChange={handleOpenDmxSpeedChange}
                      min={1}
                      max={44}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16">Universe:</label>
                    <input
                      type="number"
                      value={openDmxUniverse}
                      onChange={handleOpenDmxUniverseChange}
                      min={0}
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (OpenDMX universes start at 0)
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Default is 40 Hz. Higher values reduce latency but can increase flicker on lower-quality adapters.
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 mt-4">
                    Enter the COM port of your OpenDMX USB interface.
                    <br />On Windows this is usually COM4, COM5, etc.
                    <br />On macOS it is usually something like /dev/tty.usbserial-XXXX.
                  </p>
                </div>
          </CollapsibleSenderCard>
        </div>
      )}
    </div>
  );
};

export default DmxOutputSettings;
