import { createContext, useContext } from 'react'

export const ActiveNodesContext = createContext<Set<string>>(new Set())

export function useActiveNodesContext(): Set<string> {
  return useContext(ActiveNodesContext)
}
