
import { useAtom } from 'jotai';
import {  lightingPrefsAtom, useComplexCuesAtom } from '../atoms';
import { useEffect } from 'react';


const CueStyleToggle = () => {
  const [lightingPrefs, setLightingPrefs] = useAtom(lightingPrefsAtom);    
  const [isComplexCues, setIsComplexCues] = useAtom(useComplexCuesAtom);

  const handleToggle = () => {
    const newState = !isComplexCues;
    setIsComplexCues(newState);
    setLightingPrefs(prev => ({
      ...prev,
      complex: newState
    }));

    if (newState) {
      window.electron.ipcRenderer.send('cue-style', 'complex');
      console.log('Complex');
    } else {
      window.electron.ipcRenderer.send('cue-style', 'simple');
      console.log('Simple');
    }
  };

  useEffect(()=>{
    setIsComplexCues(lightingPrefs.complex);
  },[lightingPrefs]);

 

  return (
    <div className="flex items-center mb-4  w-[200px] justify-between">
      <label className="mr-4 text-lg font-semibold">Complex Cues</label>
      <button
        onClick={handleToggle}
        className={`w-12 h-6 rounded-full ${
          isComplexCues ? 'bg-green-500' : 'bg-gray-400'
        } relative focus:outline-none`}
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
            isComplexCues ? 'translate-x-6' : 'translate-x-0'
          }`}
        ></div>
      </button>
    </div>
  );
};

export default CueStyleToggle;