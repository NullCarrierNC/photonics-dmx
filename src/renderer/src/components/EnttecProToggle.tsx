import { useAtom } from 'jotai';
import { enttecProComPortAtom, lightingPrefsAtom, senderEnttecProEnabledAtom, dmxOutputPrefsAtom } from '../atoms';

import { useEffect } from 'react';

const EnttecProToggle = () => {
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [comPort] = useAtom(enttecProComPortAtom);
  const [prefs] = useAtom(lightingPrefsAtom);
  const [dmxOutputPrefs] = useAtom(dmxOutputPrefsAtom);

  // Debug logging
  useEffect(() => {
    console.log('EnttecProToggle - comPort:', comPort);
    console.log('EnttecProToggle - comPort.length:', comPort.length);
    console.log('EnttecProToggle - dmxOutputPrefs:', dmxOutputPrefs);
    console.log('EnttecProToggle - will be disabled:', comPort.length < 3);
  }, [comPort, dmxOutputPrefs]);

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

  useEffect(()=>{
    if (prefs.enttecProPort) {
      // COM port is now loaded in preferences, but we still need it for the sender
    }
  },[prefs]);

  useEffect(() => {
    if (prefs.dmxOutputPrefs) {
      // DMX output config is now loaded in preferences
    }
  }, [prefs]);

  // Only show the toggle if Enttec Pro is enabled in preferences
  if (!dmxOutputPrefs?.enttecProEnabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mb-4  w-[220px] justify-between">
      <div className="flex items-center gap-4 justify-between">
        <label className="text-lg font-semibold">Enttec Pro Out</label>
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
  );
};

export default EnttecProToggle;