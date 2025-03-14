import { useAtom } from 'jotai';
import { enttecProComPortAtom, lightingPrefsAtom, senderEnttecProEnabledAtom } from '../atoms';

import { useEffect } from 'react';

const EnttecProToggle = () => {
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [comPort, setComPort] = useAtom(enttecProComPortAtom);
  const [prefs] = useAtom(lightingPrefsAtom);

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

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setComPort(e.target.value);
  };

  useEffect(()=>{

    if (prefs.enttecProPort) {
      setComPort(prefs.enttecProPort);
    }
  },[prefs]);

  return (
    <div className="flex flex-col gap-2 mb-4  w-[200px] justify-between">
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
  );
};

export default EnttecProToggle;