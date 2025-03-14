import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { yargListenerEnabledAtom } from '../atoms';
import { useIpcListener } from '../utils/ipcHelpers';

const YargToggle = () => {
  const [isYargEnabled, setIsYargEnabled] = useAtom(yargListenerEnabledAtom);

  useEffect(() => {
    // Initialize toggle state from system status
    const initializeState = async () => {
      try {
        const response = await window.electron.ipcRenderer.invoke('get-system-status');
        if (response.success) {
          setIsYargEnabled(response.isYargEnabled);
        }
      } catch (error) {
        console.error('Error initializing YARG toggle state:', error);
      }
    };
    
    // Handle controllers restarted event
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, refreshing YARG toggle state');
      initializeState();
    };
    
    const cleanup = useIpcListener('controllers-restarted', handleControllersRestarted);
    
    // Initialize on mount
    initializeState();

    return cleanup;
  }, []);

  const handleToggle = () => {
    const newState = !isYargEnabled;
    setIsYargEnabled(newState);

    if (newState) {
      window.electron.ipcRenderer.send('yarg-listener-enabled');
      console.log('YARG Listener enabled');
    } else {
      window.electron.ipcRenderer.send('yarg-listener-disabled');
      console.log('YARG Listener disabled');
    }
  };

  return (
    <div className="flex items-center mb-4 w-[200px] justify-between">
      <label className="mr-4 text-lg font-semibold">Enable YARG</label>
      <button
        onClick={handleToggle}
        className={`w-12 h-6 rounded-full ${
          isYargEnabled ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none`}
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isYargEnabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        ></div>
      </button>
    </div>
  );
};

export default YargToggle;