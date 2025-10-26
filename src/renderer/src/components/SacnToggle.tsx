
import { useAtom } from 'jotai';
import { senderSacnEnabledAtom, lightingPrefsAtom } from '../atoms';

interface SacnToggleProps {
  disabled?: boolean;
}

const SacnToggle = ({ disabled = false }: SacnToggleProps) => {
  const [isSacnEnabled, setIsSacnEnabled] = useAtom(senderSacnEnabledAtom);
  const [prefs] = useAtom(lightingPrefsAtom);

  const handleToggle = () => {
    const newState = !isSacnEnabled;
    setIsSacnEnabled(newState);

    if (newState) {
      // Get the latest sacnConfig when enabling
      const networkInterface = prefs.sacnConfig?.networkInterface;
      const currentSacnConfig = {
        universe: prefs.sacnConfig?.universe || 1,
        networkInterface: networkInterface === "" ? undefined : networkInterface,
        unicastDestination: prefs.sacnConfig?.unicastDestination || "",
        useUnicast: prefs.sacnConfig?.useUnicast || false
      };

      window.electron.ipcRenderer.send('sender-enable', {
        sender: 'sacn',
        ...currentSacnConfig
      });
      console.log('sACN enabled with config:', currentSacnConfig);
    } else {
      window.electron.ipcRenderer.send('sender-disable', {sender: 'sacn'});
      console.log('sACN disabled');
    }
  };

  // Only show the toggle if sACN is enabled in preferences
  if (!prefs.dmxOutputConfig?.sacnEnabled) {
    return null;
  }

  return (
    <div className="flex items-center mb-4  w-[220px] justify-between">
      <label className={`mr-4 text-lg font-semibold ${
        disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
      }`}>
        sACN Out
      </label>
      <button
        onClick={handleToggle}
        disabled={disabled}
        className={`w-12 h-6 rounded-full ${
          isSacnEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
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