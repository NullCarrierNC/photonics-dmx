
import { useAtom } from 'jotai';
import { senderSacnEnabledAtom, dmxOutputPrefsAtom } from '../atoms';

const SacnToggle = () => {
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [dmxOutputPrefs] = useAtom(dmxOutputPrefsAtom);

  const handleToggle = () => {
    const newState = !isSacnEnabled;
    setIsSacnEnabled(newState);

    if (newState) {
      window.electron.ipcRenderer.send('sender-enable', {sender: 'sacn'});
      console.log('sACN enabled');
    } else {
      window.electron.ipcRenderer.send('sender-disable', {sender: 'sacn'});
      console.log('sACN disabled');
    }
  };

  // Only show the toggle if sACN is enabled in preferences
  if (!dmxOutputPrefs?.sacnEnabled) {
    return null;
  }

  return (
    <div className="flex items-center mb-4  w-[220px] justify-between">
      <label className="mr-4 text-lg font-semibold">sACN Out</label>
      <button
        onClick={handleToggle}
        className={`w-12 h-6 rounded-full ${
          isSacnEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none`}
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isSacnEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        ></div>
      </button>
    </div>
  );
};

export default SacnToggle;