import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { yargListenerEnabledAtom, rb3eListenerEnabledAtom } from '../atoms';
import { useIpcListener } from '../utils/ipcHelpers';

interface SystemStatus {
  isInitialized: boolean;
  isYargEnabled: boolean;
  isRb3Enabled: boolean;
  hasCueHandler: boolean;
  hasLightingSystem: boolean;
}

const StatusBar: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setIsYargEnabled] = useAtom(yargListenerEnabledAtom);
  const [, setIsRb3Enabled] = useAtom(rb3eListenerEnabledAtom);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await window.electron.ipcRenderer.invoke('get-system-status');
      
      if (response.success) {
        // Update toggle states if they don't match the actual state
        if (status && status.isYargEnabled !== response.isYargEnabled) {
          setIsYargEnabled(response.isYargEnabled);
          console.log('Updated YARG toggle state to', response.isYargEnabled);
        }
        
        if (status && status.isRb3Enabled !== response.isRb3Enabled) {
          setIsRb3Enabled(response.isRb3Enabled);
          console.log('Updated RB3E toggle state to', response.isRb3Enabled);
        }
        
        setStatus(response);
        setError(null);
      } else {
        setError(response.error || 'Unknown error');
        setStatus(null);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Update status every 3 seconds
    const interval = setInterval(fetchStatus, 3000);
    
    // Listen for controller restart events
    const handleControllersRestarted = () => {
      console.log('Controllers restarted, refreshing status');
      fetchStatus();
    };
    
    const cleanup = useIpcListener('controllers-restarted', handleControllersRestarted);
    
    return () => {
      // Clear interval
      clearInterval(interval);
      // Use the cleanup function from our utility
      cleanup();
    };
  }, []);

  // Initial setup of toggle states based on first status response
  useEffect(() => {
    if (status) {
      setIsYargEnabled(status.isYargEnabled);
      setIsRb3Enabled(status.isRb3Enabled);
    }
  }, [status?.isYargEnabled, status?.isRb3Enabled]);

  if (loading && !status) {
    return (
      <div className="bg-gray-800 text-white px-4 py-2 flex justify-between">
        <div>Loading system status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-800 text-white px-4 py-2 flex justify-between">
        <div>Error: {error}</div>
        <button 
          onClick={fetchStatus}
          className="px-2 py-1 bg-red-600 rounded hover:bg-red-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="bg-gray-800 text-white px-4 py-2 flex justify-between">
      <div className="flex space-x-4">
        <StatusIndicator 
          label="System" 
          isActive={status.isInitialized} 
        />
        <StatusIndicator 
          label="Lighting" 
          isActive={status.hasLightingSystem} 
        />
        <StatusIndicator 
          label="Cue Handler" 
          isActive={status.hasCueHandler} 
        />
        <StatusIndicator 
          label="YARG" 
          isActive={status.isYargEnabled} 
        />
        <StatusIndicator 
          label="RB3" 
          isActive={status.isRb3Enabled} 
        />
      </div>
      
      <button 
        onClick={fetchStatus}
        className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
      >
        Refresh
      </button>
    </div>
  );
};

interface StatusIndicatorProps {
  label: string;
  isActive: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ label, isActive }) => {
  return (
    <div className="flex items-center space-x-1">
      <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
      <span>{label}</span>
    </div>
  );
};

export default StatusBar; 