import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Layout from '../components/Layout.tsx'
import CreateVaultPage from '../features/vault/CreateVaultPage.tsx'
import LandingPage from '../features/vault/LandingPage.tsx'
import OpenVaultPage from '../features/vault/OpenVaultPage.tsx'
import VaultHomePage from '../features/vault/VaultHomePage.tsx'
import HistoryPage from '../features/history/HistoryPage.tsx'
import { VaultProvider } from '../features/vault/VaultProvider.tsx'
import VaultInactivityLock from '../features/vault/VaultInactivityLock.tsx'
import SeoMetadata from './SeoMetadata.tsx'
import { I18nProvider } from '../i18n/i18n.tsx'
import { useI18n } from '../i18n/useI18n.ts'

const routerBaseName = import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, '')

function NotFoundPage() {
  const { t } = useI18n()
  return (
    <section className="page-section compact-section">
      <p className="eyebrow">404</p>
      <h1>{t('notFound')}</h1>
      <p>{t('notFoundLead')}</p>
    </section>
  )
}

function NimvoApp() {
  return (
    <I18nProvider>
      <VaultProvider>
        <BrowserRouter basename={routerBaseName}>
          <VaultInactivityLock />
          <SeoMetadata />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/crear" element={<CreateVaultPage />} />
              <Route path="/abrir" element={<OpenVaultPage />} />
              <Route path="/boveda" element={<VaultHomePage />} />
              <Route path="/boveda/historial" element={<HistoryPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </VaultProvider>
    </I18nProvider>
  )
}

export default NimvoApp
