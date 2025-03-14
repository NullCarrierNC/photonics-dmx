import { useEffect, useState, useRef } from 'react';
import { CueData } from 'src/photonics-dmx/cues/cueTypes';
import DmxSettingsAccordion from '@renderer/components/DmxSettingAccordion';
import { useIpcListener } from '@renderer/utils/ipcHelpers';

const NetworkDebug = () => {
  // Local state for latest cue data from IPC events.
  const [debouncedCue, setDebouncedCue] = useState<CueData | null>(null);
  const [handledCue, setHandledCue] = useState<CueData | null>(null);
  const [previousHandledCue, setPreviousHandledCue] = useState<string | null>(null);
  const [previousLedColor, setPreviousLedColor] = useState<string | null>(null);
  const [thirdHandledCue, setThirdHandledCue] = useState<string | null>(null);
  const [thirdLedColor, setThirdLedColor] = useState<string | null>(null);
  
  // Use refs to track current values inside the event handlers
  const currentHandledCueRef = useRef<string | null>(null);
  const previousHandledCueRef = useRef<string | null>(null);
  const currentLedColorRef = useRef<string | null>(null);
  const previousLedColorRef = useRef<string | null>(null);
  
  // Counters for the events.
  const [debouncedCount, setDebouncedCount] = useState(0);
  const [handledCount, setHandledCount] = useState(0);


  useEffect(() => {
    // Reset counters on mount.
    setDebouncedCount(0);
    setHandledCount(0);

    // Tell the main process to start sending cue data
    window.electron.ipcRenderer.send('set-listen-cue-data', true);

    // Handler for the cue-debounced event.
    const handleCueDebounced = (_event: any, cueData: CueData) => {
      console.log('Received cue-debounced:', cueData);
      setDebouncedCue(cueData);
      setDebouncedCount((prev) => prev + 1);
    };

    // Handler for the cue-handled event.
    const handleCueHandled = (_event: any, cueData: CueData) => {
      console.log('Received cue-handled:', cueData);
      
      // Get the LED color from the cue data
      const currentLedColorValue = cueData.ledColor || '';
      
    
      // Only update cue history if this is a different cue
      if (currentHandledCueRef.current && currentHandledCueRef.current !== cueData.lightingCue) {
        console.log('Updating cue history with LED colors:', {
          moving_to_third: previousLedColorRef.current,
          moving_to_previous: currentLedColorRef.current
        });
        
        // Move current to previous, and previous to third
        setThirdHandledCue(previousHandledCueRef.current);
        setThirdLedColor(previousLedColorRef.current);
        setPreviousHandledCue(currentHandledCueRef.current);
        setPreviousLedColor(currentLedColorRef.current);
        
        previousHandledCueRef.current = currentHandledCueRef.current;
        previousLedColorRef.current = currentLedColorRef.current;
      }
      
      // Update our refs to track the current cue and LED color
      currentHandledCueRef.current = cueData.lightingCue;
      currentLedColorRef.current = currentLedColorValue;
      
      setHandledCue(cueData);
      setHandledCount((prev) => prev + 1);
    };

    // Use our custom IPC listener utility to register handlers
    const cleanupDebounced = useIpcListener('cue-debounced', handleCueDebounced);
    const cleanupHandled = useIpcListener('cue-handled', handleCueHandled);

    return () => {
      console.log('NetworkDebug unmounting, cleaning up listeners');
      // First disable the data listening on the main process
      window.electron.ipcRenderer.send('set-listen-cue-data', false);
      
      // Clean up our event listeners 
      cleanupDebounced();
      cleanupHandled();
    };
  }, []); 


  const renderCueData = (data: CueData) => {
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'Courier New, monospace', fontSize: '0.8rem' }}>
        {Object.entries(data).map(([key, value]) => {
          // Join array values into a comma-separated string.
          const displayValue = Array.isArray(value) ? value.join(', ') : value;
          // Bold and style lightingCue and strobeState.
          if (key === 'lightingCue' || key === 'strobeState' || key == 'beat' || key == 'songSection' 
            || key == 'beatsPerMinute' || key == 'pauseState' || key == 'venueSize') {
            return (
              <li key={key}>
                <strong>{key}:</strong>{' '}
                <span style={{ fontFamily: 'Courier New, monospace' }}>
                  <strong>{displayValue}</strong>
                </span>
              </li>
            );
          }
          return (
            <li key={key}>
              {key}: {displayValue}
            </li>
          );
        })}
      </ul>
    );
  };

  const debouncedCueName = debouncedCue ? debouncedCue.lightingCue : '';
  const handledCueName = handledCue ? handledCue.lightingCue : '';
  const strobeState = handledCue ? handledCue.strobeState : '';
  const ledColor = handledCue?.ledColor || '';


  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Network Status</h1>

      <DmxSettingsAccordion startOpen={false} />

      <hr className="mt-8 mb-8" />

      <h2 className="text-lg font-bold mb-4">Network Lighting Cue Data</h2>
      <p className="mb-8">This window will display the raw light data sent over the network by YARG/RB3E. 
       Enable either YARG or RB3E above and start a song in the game. You should see the network data appear below. 
       If nothing happens, verify your network connections, and ensure that all elements are on the same network / subnet.
       You can also try navigating to a different page then returning to this one.</p>
       

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {/* Handled Cue Panel */}
        <div style={{ flex: '1 1 300px' }}>
          <h3 className="text-md font-semibold ">
            Handled Cue ({handledCount}): {handledCueName} {strobeState && `[${strobeState}]`} {ledColor && `[LED: ${ledColor}]`}
          </h3>
          
          {/* Cue History */}
          <div className="text-md mb-2">
            {previousHandledCue && previousHandledCue !== handledCueName && (
              <p className='text-gray-400'>
                Previous cue: {previousHandledCue} 
                {previousLedColor ? ` [LED: ${previousLedColor}]` : ''}
              </p>
            )}
            {thirdHandledCue && thirdHandledCue !== previousHandledCue && thirdHandledCue !== handledCueName && (
              <p className='text-sm text-gray-500'>
                Third cue: {thirdHandledCue} 
                {thirdLedColor ? ` [LED: ${thirdLedColor}]` : ''}
              </p>
            )}
          </div>
          
          {handledCue ? (
            renderCueData(handledCue)
          ) : (
            <p>No handled cues received yet.</p>
          )}
        </div>

        {/* Debounced Cue Panel */}
        <div style={{ flex: '1 1 300px' }}>
          <h3 className="text-md font-semibold mb-4">
            Debounced Cue ({debouncedCount}): {debouncedCueName}
          </h3>
          {debouncedCue ? (
            renderCueData(debouncedCue)
          ) : (
            <p>No debounced cues received yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkDebug;