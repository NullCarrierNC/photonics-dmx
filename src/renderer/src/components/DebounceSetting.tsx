import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { effectDebounceTimeAtom } from '../atoms';

const DebounceSetting = () => {
  const [debounce, setDebounce] = useAtom(effectDebounceTimeAtom);
  const [inputValue, setInputValue] = useState(debounce.toString());

  // On mount, retrieve the effect debounce value via IPC and update the atom and input state.
  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('get-effect-debounce')
      .then((value) => {
        setDebounce(value);
        setInputValue(value.toString());
      })
      .catch((err) => {
        console.error('Failed to retrieve effect debounce value:', err);
      });
  }, [setDebounce]);

  const handleDebounceUpdate = () => {
    let newValue = Number(inputValue);
    if (newValue < 0){
      newValue = 0;
    }

    if (!isNaN(newValue)) {
      setDebounce(newValue);
      window.electron.ipcRenderer.send('update-effect-debounce', newValue);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <label className="mr-4 text-lg font-semibold">
        Debounce Period (in ms)
      </label>
      <input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="border rounded px-2 py-1 text-gray-900 w-24"
        min="0"
      />
      <button
        onClick={handleDebounceUpdate}
        className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600"
      >
        Update
      </button>
    </div>
  );
};

export default DebounceSetting;