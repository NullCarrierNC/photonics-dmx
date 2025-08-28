import { useAtom } from 'jotai';
import { 
  senderArtNetEnabledAtom, 
  artNetConfigAtom,
  lightingPrefsAtom
} from '../atoms';

const ArtNetToggle = () => {
  const [isArtNetEnabled, setIsArtNetEnabled] = useAtom(senderArtNetEnabledAtom);
  const [artNetConfig] = useAtom(artNetConfigAtom);
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



  // Only show the toggle if ArtNet is enabled in preferences
  if (!prefs.dmxOutputConfig?.artNetEnabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mb-4 w-[220px] justify-between">
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
    </div>
  );
};

export default ArtNetToggle; 