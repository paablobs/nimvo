import { Button } from '../components/controls.tsx'
import { useI18n } from '../i18n/useI18n.ts'

export interface UpdateBannerProps {
  offlineReady: boolean
  updateReady: boolean
  /** An unlocked vault exists in memory; reloading would lock it. */
  vaultOpen: boolean
  /** The open vault has changes that are not saved yet. */
  vaultDirty: boolean
  onUpdate: () => void
  onDismissOfflineReady: () => void
}

/** Presentational notice for offline readiness and available updates. */
export default function UpdateBanner({ offlineReady, updateReady, vaultOpen, vaultDirty, onUpdate, onDismissOfflineReady }: UpdateBannerProps) {
  const { t } = useI18n()
  if (!offlineReady && !updateReady) return null

  if (updateReady) {
    return <div className="pwa-banner" role="status">
      <p>{vaultDirty ? t('updateSaveFirst') : vaultOpen ? t('updateLocksVault') : t('updateAvailable')}</p>
      <Button className="button button-small button-primary" onClick={onUpdate} disabled={vaultDirty}>{t('updateNow')}</Button>
    </div>
  }

  return <div className="pwa-banner" role="status">
    <p>{t('offlineReady')}</p>
    <Button className="button button-small" onClick={onDismissOfflineReady}>{t('close')}</Button>
  </div>
}
