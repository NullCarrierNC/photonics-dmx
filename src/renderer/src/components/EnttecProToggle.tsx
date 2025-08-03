import { useAtom } from 'jotai';
import { enttecProComPortAtom, lightingPrefsAtom, senderEnttecProEnabledAtom, dmxSettingsPrefsAtom } from '../atoms';

import { useEffect } from 'react';

const EnttecProToggle = () => {
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [comPort, setComPort] = useAtom(enttecProComPortAtom);
  const [prefs] = useAtom(lightingPrefsAtom);
  const [dmxSettingsPrefs, setDmxSettingsPrefs] = useAtom(dmxSettingsPrefsAtom);

  const handleToggle = () => {
    const newState = !isEnttecProEnabled;
    setIsEnttecProEnabled(newState);

    if (newState) {
      window.electron.ipcRenderer.send('sender-enable', { sender: 'enttecpro', port:comPort });
      console.log('EnttecPro enabled');
    } else {
      window.electron.ipcRenderer.send('sender-disable', { sender: 'enttecpro' });
      console.log('EnttecPro disabled');
    }
  };

  const handlePortChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value;
    setComPort(newPort);
    
    // Save the updated port to preferences
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        enttecProPort: newPort
      });
    } catch (error) {
      console.error('Failed to save EnttecPro port configuration:', error);
    }
  };

  const handleExpandToggle = async () => {
    const newExpandedState = !dmxSettingsPrefs.enttecProExpanded;
    const newPrefs = {
      ...dmxSettingsPrefs,
      enttecProExpanded: newExpandedState
    };
    
    setDmxSettingsPrefs(newPrefs);
    
    // Save the updated preferences
    try {
      await window.electron.ipcRenderer.invoke('save-prefs', {
        dmxSettingsPrefs: newPrefs
      });
    } catch (error) {
      console.error('Failed to save DMX settings preferences:', error);
    }
  };

  useEffect(()=>{

    if (prefs.enttecProPort) {
      setComPort(prefs.enttecProPort);
    }
  },[prefs]);

  useEffect(() => {
    if (prefs.dmxSettingsPrefs) {
      setDmxSettingsPrefs(prev => ({
        ...prev,
        ...prefs.dmxSettingsPrefs
      }));
    }
  }, [prefs, setDmxSettingsPrefs]);

  return (
    <div className="flex flex-col gap-2 mb-4  w-[220px] justify-between">
      <div className="flex items-center gap-4 justify-between">
        <label className="text-lg font-semibold">Enttec Pro Out</label>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExpandToggle}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title={dmxSettingsPrefs.enttecProExpanded ? "Collapse configuration" : "Expand configuration"}
          >
            <svg
              className={`w-4 h-4 transform transition-transform duration-200 ${
                dmxSettingsPrefs.enttecProExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleToggle}
            disabled={comPort.length < 3}
            className={`w-12 h-6 rounded-full transition-colors ${
              isEnttecProEnabled ? 'bg-green-500' : 'bg-gray-400'
            } relative focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                isEnttecProEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>
      </div>

      {dmxSettingsPrefs.enttecProExpanded && (
        <div className="border-t pt-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">COM:</label>
            <input
              type="text"
              value={comPort}
              onChange={handlePortChange}
              className="border rounded px-2 py-1 w-[156px] text-black"
              placeholder="COM3"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EnttecProToggle;