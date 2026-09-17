import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Layout from '../components/Layout.tsx'
import CreateVaultPage from '../features/vault/CreateVaultPage.tsx'
import LandingPage from '../features/vault/LandingPage.tsx'
import OpenVaultPage from '../features/vault/OpenVaultPage.tsx'
import VaultHomePage from '../features/vault/VaultHomePage.tsx'
import { VaultProvider } from '../features/vault/VaultProvider.tsx'

function NotFoundPage() {
  return (
    <section className="page-section compact-section">
      <p className="eyebrow">404</p>
      <h1>Página no encontrada</h1>
      <p>Esta ruta no forma parte de la primera versión de Moneo.</p>
    </section>
  )
}

function MoneoApp() {
  return (
    <VaultProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/crear" element={<CreateVaultPage />} />
            <Route path="/abrir" element={<OpenVaultPage />} />
            <Route path="/boveda" element={<VaultHomePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </VaultProvider>
  )
}

export default MoneoApp
