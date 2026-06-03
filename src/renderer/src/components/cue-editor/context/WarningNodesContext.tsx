import { createContext, useContext } from 'react'

export const WarningNodesContext = createContext<Set<string>>(new Set())

export function useWarningNodesContext(): Set<string> {
  return useContext(WarningNodesContext)
}
