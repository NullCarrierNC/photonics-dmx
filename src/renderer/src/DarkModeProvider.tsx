import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface DarkModeContextProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextProps | undefined>(undefined);

/**
 * Context provider for managing application-wide dark mode state
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {JSX.Element} Provider component
 */
export const DarkModeProvider = ({ children }: { children: ReactNode }) => {
  // Initialize from localStorage or default to true (dark mode)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Try to get from localStorage, default to true if not found
    const savedMode = localStorage.getItem('darkMode');
    return savedMode !== null ? savedMode === 'true' : true;
  });


  useEffect(() => {
    // Apply the appropriate class to the html element
    document.documentElement.classList.toggle('dark', isDarkMode);
    
    // Save preference to localStorage
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prevMode) => !prevMode);
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) throw new Error('useDarkMode must be used within a DarkModeProvider');
  return context;
};