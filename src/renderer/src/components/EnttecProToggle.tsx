import { useAtom } from 'jotai';
import { enttecProComPortAtom, senderEnttecProEnabledAtom, lightingPrefsAtom } from '../atoms';

const EnttecProToggle = () => {
  const [isEnttecProEnabled, setIsEnttecProEnabled] = useAtom(senderEnttecProEnabledAtom);
  const [comPort] = useAtom(enttecProComPortAtom);
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



  // Only show the toggle if Enttec Pro is enabled in preferences
  if (!prefs.dmxOutputConfig?.enttecProEnabled) {
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