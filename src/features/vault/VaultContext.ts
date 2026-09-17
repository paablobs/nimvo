import { createContext } from 'react'
import type { VaultSession, VaultSnapshot } from './VaultSession.ts'

export interface VaultContextValue extends VaultSnapshot {
  session: VaultSession
  create: (password: string) => Promise<void>
  open: (bytes: Uint8Array, password: string) => Promise<void>
  openFromPicker: (password: string) => Promise<boolean>
  save: () => Promise<{ filename: string; exportedAt: Date } | null>
  saveAs: () => Promise<{ filename: string; exportedAt: Date } | null>
  saveCopy: () => Promise<{ filename: string; exportedAt: Date }>
  export: () => Promise<{ filename: string; exportedAt: Date } | null>
  lock: () => Promise<void>
  operation: VaultSession['operation']
}

export const VaultContext = createContext<VaultContextValue | null>(null)
