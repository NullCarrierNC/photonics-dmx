import { createContext, useContext, useState, ReactNode, useEffect } from 'react'

interface DarkModeContextProps {
  isDarkMode: boolean
  toggleDarkMode: () => void
}

const DarkModeContext = createContext<DarkModeContextProps | undefined>(undefined)

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
    const savedMode = localStorage.getItem('darkMode')
    return savedMode !== null ? savedMode === 'true' : true
  })

  useEffect(() => {
    // Apply the appropriate class to the html element
    document.documentElement.classList.toggle('dark', isDarkMode)

    // Save preference to localStorage
    localStorage.setItem('darkMode', String(isDarkMode))
  }, [isDarkMode])

  // Every window of the app shares this storage, and a write raises a storage event in each window
  // but the one that wrote it, so the other windows follow a toggle.
  useEffect(() => {
    const followOtherWindow = (event: StorageEvent) => {
      if (event.key !== 'darkMode' || event.newValue === null) return
      setIsDarkMode(event.newValue === 'true')
    }
    window.addEventListener('storage', followOtherWindow)
    return () => window.removeEventListener('storage', followOtherWindow)
  }, [])

  const toggleDarkMode = () => {
    setIsDarkMode((prevMode) => !prevMode)
  }

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export const useDarkMode = () => {
  const context = useContext(DarkModeContext)
  if (!context) throw new Error('useDarkMode must be used within a DarkModeProvider')
  return context
}
