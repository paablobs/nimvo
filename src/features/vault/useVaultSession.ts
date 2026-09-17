import { useContext } from 'react'
import { VaultContext, type VaultContextValue } from './VaultContext.ts'

export function useVaultSession(): VaultContextValue {
  const context = useContext(VaultContext)
  if (!context) throw new Error('useVaultSession debe usarse dentro de VaultProvider')
  return context
}
