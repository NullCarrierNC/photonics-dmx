import { createContext, useContext } from 'react'

export const ErrorNodesContext = createContext<Set<string>>(new Set())

export function useErrorNodesContext(): Set<string> {
  return useContext(ErrorNodesContext)
}
