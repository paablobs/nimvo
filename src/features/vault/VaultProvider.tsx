import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { VaultContext, type VaultContextValue } from './VaultContext.ts'
import { VaultSession, type VaultSessionOptions } from './VaultSession.ts'

export interface VaultProviderProps extends VaultSessionOptions {
  children: ReactNode
  session?: VaultSession
}

export function VaultProvider({ children, session: providedSession, ...options }: VaultProviderProps) {
  const [session] = useState(() => providedSession ?? new VaultSession(options))
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)

  useEffect(() => {
    if (!snapshot.dirty) return undefined
    const handler = (event: BeforeUnloadEvent) => session.handleBeforeUnload(event)
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [session, snapshot.dirty])

  const value = useMemo<VaultContextValue>(() => ({
    ...snapshot,
    session,
    create: session.create.bind(session),
    open: session.open.bind(session),
    openFromPicker: session.openFromPicker.bind(session),
    save: session.save.bind(session),
    saveAs: session.saveAs.bind(session),
    saveCopy: session.saveCopy.bind(session),
    export: session.export.bind(session),
    lock: session.lock.bind(session),
    operation: session.operation.bind(session),
  }), [session, snapshot])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
