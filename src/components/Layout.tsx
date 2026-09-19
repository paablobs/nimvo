import { Link, NavLink, Outlet } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.ts'
import PreferencesMenu from './PreferencesMenu.tsx'

function Layout() {
  const { t } = useI18n()
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label={t('homeLabel')}>
          nimvo
        </Link>
        <div className="site-header-controls">
        <nav aria-label={t('mainNavigation')}>
          <NavLink className="nav-link" to="/crear">
            {t('createFile')}
          </NavLink>
          <NavLink className="nav-link" to="/abrir">
            {t('openFile')}
          </NavLink>
          <NavLink className="nav-link" to="/boveda" end>
            {t('vault')}
          </NavLink>
          <NavLink className="nav-link" to="/boveda/historial">
            {t('history')}
          </NavLink>
        </nav>
        <div className="preference-controls" aria-label={t('preferences')}><PreferencesMenu /></div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>{t('footerVersion')}</span>
        <span>{t('footerLocal')}</span>
      </footer>
    </div>
  )
}

export default Layout
