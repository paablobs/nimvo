import { useVaultSession } from '../features/vault/useVaultSession.ts'
import UpdateBanner from './UpdateBanner.tsx'
import { useServiceWorker } from './useServiceWorker.ts'

/** Connects the service worker state with the vault so updates never discard unsaved work. */
export default function PwaStatus() {
  const worker = useServiceWorker()
  const vault = useVaultSession()
  return <UpdateBanner
    offlineReady={worker.offlineReady}
    updateReady={worker.updateReady}
    vaultOpen={vault.status === 'unlocked'}
    vaultDirty={vault.dirty}
    onUpdate={worker.applyUpdate}
    onDismissOfflineReady={worker.dismissOfflineReady}
  />
}
